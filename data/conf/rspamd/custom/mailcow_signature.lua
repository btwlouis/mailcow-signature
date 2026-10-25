--[[
  mailcow_signature.lua - serverseitige E-Mail-Signaturen fuer mailcow (rspamd prefilter)

  Fuegt die Signatur wie Exclaimer/CodeTwo bei Microsoft 365 direkt unter den
  neuesten Nachrichtentext ein - also ueber dem zitierten Verlauf, nicht ans
  Ende der Mail wie der mailcow "Domain wide footer".

  Sicherheitsprinzipien:
    * S/MIME, PGP (MIME und inline), Berichte (DSN/MDN), TNEF und optional
      Kalendereinladungen werden nie angefasst.
    * Es werden ausschliesslich die Bytes des ersten text/html- und
      text/plain-Teils ersetzt. Alle anderen Bytes (Header, Boundaries,
      Anhaenge, weitergeleitete Nachrichten) bleiben unveraendert.
    * Die Top-Level-Header werden nie veraendert (Milter-Body-Replace).
    * Das Ergebnis wird erneut geparst und gegen das Original geprueft.
      Bei jedem Zweifel oder Fehler geht die Mail unveraendert raus.
    * Laeuft als prefilter, also vor dkim_signing/ARC: die DKIM-Signatur
      wird ueber die Mail inklusive Signatur berechnet.
]]

local M = {}

local BASE = '/etc/rspamd/custom/signature'
local SYMBOL = 'MAILCOW_SIGNATURE'
local N = 'mailcow_signature'

M.defaults = {
  enabled = true,
  dry_run = false,
  live_senders = {},
  domains = {},
  require_auth = true,
  trusted_networks = {},
  exclude_senders = {},
  skip_internal = false,
  internal_domains = {},
  skip_calendar = true,
  max_size = 30 * 1024 * 1024,
  cache_ttl = 60,
  vars = {},
}

---------------------------------------------------------------------------
-- Allgemeine Helfer
---------------------------------------------------------------------------

local function trim(s)
  return (s:gsub('^%s+', ''):gsub('%s+$', ''))
end

local function nonempty(v)
  return v ~= nil and tostring(v) ~= ''
end

local function list_has(list, value)
  if type(list) ~= 'table' then return false end
  for _, v in ipairs(list) do
    if tostring(v):lower() == value then return true end
  end
  return false
end

---------------------------------------------------------------------------
-- Base64 / Quoted-Printable (reines Lua, damit Encode/Decode exakt
-- kontrollierbar und testbar sind)
---------------------------------------------------------------------------

local B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local B64IDX = {}
for i = 1, 64 do B64IDX[B64:sub(i, i)] = i - 1 end

function M.b64_decode(s)
  s = s:gsub('[^%w%+/]', '')
  local out = {}
  for i = 1, #s, 4 do
    local c1, c2, c3, c4 = s:sub(i, i), s:sub(i + 1, i + 1), s:sub(i + 2, i + 2), s:sub(i + 3, i + 3)
    local cnt = 1 + (c2 ~= '' and 1 or 0) + (c3 ~= '' and 1 or 0) + (c4 ~= '' and 1 or 0)
    local v = (B64IDX[c1] or 0) * 262144 + (B64IDX[c2] or 0) * 4096
      + (B64IDX[c3] or 0) * 64 + (B64IDX[c4] or 0)
    local b1, b2, b3 = math.floor(v / 65536) % 256, math.floor(v / 256) % 256, v % 256
    if cnt == 4 then
      out[#out + 1] = string.char(b1, b2, b3)
    elseif cnt == 3 then
      out[#out + 1] = string.char(b1, b2)
    elseif cnt == 2 then
      out[#out + 1] = string.char(b1)
    end
  end
  return table.concat(out)
end

function M.b64_encode(data, nl)
  local lines, line, ll = {}, {}, 0
  for i = 1, #data, 3 do
    local a, b, c = data:byte(i, i + 2)
    local v = a * 65536 + (b or 0) * 256 + (c or 0)
    local q1 = math.floor(v / 262144) % 64 + 1
    local q2 = math.floor(v / 4096) % 64 + 1
    local q3 = math.floor(v / 64) % 64 + 1
    local q4 = v % 64 + 1
    line[#line + 1] = B64:sub(q1, q1) .. B64:sub(q2, q2)
      .. (b and B64:sub(q3, q3) or '=') .. (c and B64:sub(q4, q4) or '=')
    ll = ll + 4
    if ll >= 76 then
      lines[#lines + 1] = table.concat(line)
      line, ll = {}, 0
    end
  end
  if #line > 0 then lines[#lines + 1] = table.concat(line) end
  return table.concat(lines, nl)
end

function M.qp_decode(s)
  s = s:gsub('[ \t]+(\r?\n)', '%1')
  s = s:gsub('[ \t]+$', '')
  s = s:gsub('=\r?\n', '')
  s = s:gsub('=(%x%x)', function(h) return string.char(tonumber(h, 16)) end)
  return s
end

-- Harte Zeilenumbrueche werden als nl ausgegeben, Zeilen max. 76 Zeichen.
function M.qp_encode(str, nl)
  local out = {}
  local pos, n = 1, #str
  while pos <= n do
    local e = str:find('\n', pos, true)
    local line, has_nl
    if e then
      line, has_nl, pos = str:sub(pos, e - 1), true, e + 1
    else
      line, has_nl, pos = str:sub(pos), false, n + 1
    end
    if line:sub(-1) == '\r' then line = line:sub(1, -2) end
    local cur, len = {}, 0
    local ln = #line
    for k = 1, ln do
      local b = line:byte(k)
      local tok
      if (b >= 33 and b <= 126 and b ~= 61) or ((b == 32 or b == 9) and k < ln) then
        tok = string.char(b)
      else
        tok = string.format('=%02X', b)
      end
      if len + #tok > 75 then
        out[#out + 1] = table.concat(cur) .. '=' .. nl
        cur, len = {}, 0
      end
      cur[#cur + 1] = tok
      len = len + #tok
    end
    out[#out + 1] = table.concat(cur)
    if has_nl then out[#out + 1] = nl end
  end
  return table.concat(out)
end

---------------------------------------------------------------------------
-- UTF-8 / Zeichensatz
---------------------------------------------------------------------------

local function utf8_cp(seq)
  local b1, n = seq:byte(1), #seq
  if n == 2 and b1 >= 0xC2 and b1 < 0xE0 then
    return (b1 % 32) * 64 + seq:byte(2) % 64
  elseif n == 3 and b1 >= 0xE0 and b1 < 0xF0 then
    return (b1 % 16) * 4096 + (seq:byte(2) % 64) * 64 + seq:byte(3) % 64
  elseif n == 4 and b1 >= 0xF0 and b1 < 0xF5 then
    return (b1 % 8) * 262144 + (seq:byte(2) % 64) * 4096 + (seq:byte(3) % 64) * 64 + seq:byte(4) % 64
  end
  return nil
end

local function map_utf8(s, fn)
  -- Ein Lead-Byte gefolgt von Continuation-Bytes = ein Zeichen
  return (s:gsub('[\xC0-\xFF][\x80-\xBF]*', function(seq) return fn(utf8_cp(seq)) end))
end

local TRANSLIT = {
  [0xA0] = ' ', [0xA9] = '(c)', [0xAE] = '(R)', [0xB7] = '*', [0xC4] = 'Ae', [0xD6] = 'Oe',
  [0xDC] = 'Ue', [0xE4] = 'ae', [0xF6] = 'oe', [0xFC] = 'ue', [0xDF] = 'ss', [0x1E9E] = 'SS',
  [0xC0] = 'A', [0xC1] = 'A', [0xC2] = 'A', [0xC7] = 'C', [0xC8] = 'E', [0xC9] = 'E', [0xCA] = 'E',
  [0xE0] = 'a', [0xE1] = 'a', [0xE2] = 'a', [0xE7] = 'c', [0xE8] = 'e', [0xE9] = 'e', [0xEA] = 'e',
  [0xEB] = 'e', [0xEE] = 'i', [0xEF] = 'i', [0xF4] = 'o', [0xF1] = 'n', [0xF9] = 'u', [0xFB] = 'u',
  [0x2013] = '-', [0x2014] = '-', [0x2018] = "'", [0x2019] = "'", [0x201A] = "'", [0x201C] = '"',
  [0x201D] = '"', [0x201E] = '"', [0x2022] = '*', [0x2026] = '...', [0x20AC] = 'EUR', [0x2122] = '(TM)',
}

function M.to_entities(s)
  return map_utf8(s, function(cp) return cp and ('&#' .. cp .. ';') or '?' end)
end

function M.to_ascii(s)
  return map_utf8(s, function(cp) return (cp and TRANSLIT[cp]) or '?' end)
end

local function to_single_byte(s, euro)
  return map_utf8(s, function(cp)
    if cp and cp >= 0xA0 and cp <= 0xFF then return string.char(cp) end
    if cp == 0x20AC and euro then return string.char(euro) end
    return (cp and TRANSLIT[cp]) or '?'
  end)
end

local function charset_class(cs)
  cs = (cs or 'us-ascii'):lower():gsub('[%s"]', '')
  if cs == 'utf-8' or cs == 'utf8' then return 'utf8' end
  if cs == 'us-ascii' or cs == 'ascii' or cs == 'ansi_x3.4-1968' or cs == '' then return 'ascii' end
  if cs == 'iso-8859-1' or cs == 'iso8859-1' or cs == 'iso_8859-1' or cs == 'latin1' then return 'latin1' end
  if cs == 'windows-1252' or cs == 'cp1252' then return 'cp1252' end
  if cs == 'iso-8859-15' or cs == 'iso8859-15' or cs == 'latin-9' then return 'latin9' end
  if cs:find('^utf%-1[6]') or cs:find('^utf%-32') or cs:find('^utf%-7') or cs:find('^ucs')
      or cs:find('^iso%-2022') or cs:find('^hz') then
    return nil -- nicht ASCII-kompatibel: Teil nicht anfassen
  end
  return 'ascii_compat'
end

local function has_8bit(s)
  return s:find('[\128-\255]') ~= nil
end

---------------------------------------------------------------------------
-- Minimaler MIME-Parser mit absoluten Byte-Offsets
---------------------------------------------------------------------------

local function parse_header_block(raw)
  local unfolded = raw:gsub('\r?\n[ \t]+', ' ')
  local h = {}
  for line in (unfolded .. '\n'):gmatch('([^\n]*)\n') do
    local name, value = line:match('^([^:%s]+)%s*:%s*(.-)%s*$')
    if name then
      name = name:lower()
      if h[name] == nil then h[name] = value end
    end
  end
  return h
end

function M.parse_ct(v)
  v = v or 'text/plain'
  local t = (v:match('^%s*([^;%s]+)') or 'text/plain'):lower()
  local params = {}
  for k, val in v:gmatch(';%s*([^=;%s]+)%s*=%s*"([^"]*)"') do params[k:lower()] = val end
  for k, val in v:gmatch(';%s*([^=;%s]+)%s*=%s*([^;%s"]+)') do
    k = k:lower()
    if params[k] == nil then params[k] = val end
  end
  return t, params
end

-- Liefert hs, he (Header-Bereich ohne abschliessende Leerzeile) und bs (Body-Start)
local function split_entity(s, i, j)
  if i > j then return i, i - 1, i end
  if s:sub(i, i + 1) == '\r\n' then return i, i - 1, i + 2 end
  if s:sub(i, i) == '\n' then return i, i - 1, i + 1 end
  local a, b = s:find('\r?\n\r?\n', i)
  if not a or a > j then return i, j, j + 1 end
  return i, a - 1, b + 1
end

function M.parse_entity(s, i, j, depth, top)
  local hs, he, bs = split_entity(s, i, j)
  local hdr = parse_header_block(s:sub(hs, he))
  local ct, params = M.parse_ct(hdr['content-type'])
  local node = {
    hs = hs, he = he, bs = bs, be = j, ct = ct, params = params, hdr = hdr, top = top,
    cte = ((hdr['content-transfer-encoding'] or '7bit'):lower():match('^%s*([^%s;]+)')) or '7bit',
    disp = (hdr['content-disposition'] or ''):lower(),
    children = {},
  }
  if ct:sub(1, 10) == 'multipart/' then
    local b = params.boundary
    if not b or b == '' or depth > 30 then
      node.broken = true
      return node
    end
    local delim = '--' .. b
    local pos, part_start = bs, nil
    while true do
      local a = s:find(delim, pos, true)
      if not a or a > j then break end
      local at_line_start = (a == bs) or s:sub(a - 1, a - 1) == '\n'
      local after = s:sub(a + #delim, a + #delim + 1)
      local c1 = after:sub(1, 1)
      if at_line_start and (after == '--' or c1 == '\r' or c1 == '\n' or c1 == ' ' or c1 == '\t') then
        if part_start then
          local pe = a - 1
          if s:sub(pe, pe) == '\n' then pe = pe - 1 end
          if s:sub(pe, pe) == '\r' then pe = pe - 1 end
          node.children[#node.children + 1] = M.parse_entity(s, part_start, pe, depth + 1, false)
        end
        if after == '--' then
          node.closed = true
          break
        end
        local eol = s:find('\n', a + #delim, true)
        if not eol or eol > j then break end
        part_start, pos = eol + 1, eol + 1
      else
        pos = a + #delim
      end
    end
    if not node.closed then node.broken = true end
  end
  return node
end

M.FORBIDDEN = {
  ['multipart/signed'] = true, ['multipart/encrypted'] = true,
  ['application/pkcs7-mime'] = true, ['application/x-pkcs7-mime'] = true,
  ['application/pkcs7-signature'] = true, ['application/x-pkcs7-signature'] = true,
  ['application/pgp-encrypted'] = true, ['application/pgp-signature'] = true,
  ['application/pgp-keys'] = false,
  ['multipart/report'] = true, ['message/disposition-notification'] = true,
  ['message/delivery-status'] = true,
  ['application/ms-tnef'] = true, ['application/vnd.ms-tnef'] = true,
}

local function is_attachment(node)
  return node.disp:find('^%s*attachment') ~= nil or node.disp:find('filename') ~= nil
    or node.params.name ~= nil
end

function M.walk(node, ctx)
  ctx = ctx or { leaves = {} }
  if M.FORBIDDEN[node.ct] and not ctx.forbidden then ctx.forbidden = node.ct end
  if node.broken then ctx.broken = true end
  if node.ct == 'text/calendar' or node.ct == 'application/ics' then ctx.calendar = true end
  if node.ct:sub(1, 10) == 'multipart/' then
    for _, ch in ipairs(node.children) do M.walk(ch, ctx) end
  else
    ctx.leaves[#ctx.leaves + 1] = node.ct
    if not is_attachment(node) then
      if node.ct == 'text/html' and not ctx.html then ctx.html = node end
      if node.ct == 'text/plain' and not ctx.plain then ctx.plain = node end
    end
  end
  return ctx
end

---------------------------------------------------------------------------
-- Header-Felder eines Unterteils umschreiben (nur fuer Nicht-Top-Level-Teile)
---------------------------------------------------------------------------

local function header_fields(raw)
  local fields, pos = {}, 1
  while pos <= #raw do
    local e = raw:find('\n', pos, true)
    local line = e and raw:sub(pos, e) or raw:sub(pos)
    pos = e and e + 1 or #raw + 1
    local c = line:sub(1, 1)
    if (c == ' ' or c == '\t') and #fields > 0 then
      fields[#fields] = fields[#fields] .. line
    else
      fields[#fields + 1] = line
    end
  end
  return fields
end

local function set_header(raw, name, value, nl)
  local fields = header_fields(raw)
  local lname = name:lower()
  local found = false
  for i, f in ipairs(fields) do
    local fname = f:match('^([^:%s]+)%s*:')
    if fname and fname:lower() == lname then
      local ends_nl = f:sub(-1) == '\n'
      fields[i] = name .. ': ' .. value .. (ends_nl and nl or '')
      found = true
      break
    end
  end
  if not found then
    if #fields > 0 and fields[#fields]:sub(-1) ~= '\n' then
      fields[#fields] = fields[#fields] .. nl
      fields[#fields + 1] = name .. ': ' .. value
    else
      fields[#fields + 1] = name .. ': ' .. value
    end
  end
  return table.concat(fields)
end

local function build_ct(ct, params, charset)
  local keys = {}
  for k in pairs(params) do
    if k ~= 'charset' then keys[#keys + 1] = k end
  end
  table.sort(keys)
  local out = { ct, 'charset="' .. charset .. '"' }
  for _, k in ipairs(keys) do
    out[#out + 1] = k .. '="' .. tostring(params[k]):gsub('"', '') .. '"'
  end
  return table.concat(out, '; ')
end

---------------------------------------------------------------------------
-- Einfuegeposition finden (Reverse Engineering der Antwort-/Weiterleitungs-
-- Marker gaengiger Clients)
---------------------------------------------------------------------------

local ATTRIBUTION = {
  'wrote:', 'schrieb', 'a écrit', 'a &eacute;crit', 'escribió', 'escribi&oacute;', 'ha scritto',
  'skrev', 'schreef', 'napisał', 'kirjoitti', 'написал', 'escreveu',
}

local HTML_TEXT_MARKERS = {
  '-----original message-----', '-----urspr', '---------- forwarded message',
  '-------- forwarded message', '-------- weitergeleitete nachricht', '-------- original message',
  '-------- originalnachricht', '-------- ursprüngliche nachricht', 'begin forwarded message:',
  'anfang der weitergeleiteten nachricht',
}

local function tag_start(lc, p)
  local a, stop = p, math.max(1, p - 2000)
  while a >= stop do
    if lc:byte(a) == 60 then return a end -- '<'
    a = a - 1
  end
  return p
end

local function only_markup(seg)
  seg = seg:gsub('<[^>]*>', ''):gsub('&nbsp;', ''):gsub('&#160;', ''):gsub('\xC2\xA0', ''):gsub('%s', '')
  return seg == ''
end

local function last_tag_before(lc, p, limit, tags)
  local from = math.max(1, p - limit)
  local seg = lc:sub(from, p - 1)
  local best
  for _, t in ipairs(tags) do
    local s = 1
    while true do
      local a = seg:find(t, s, true)
      if not a then break end
      if not best or a > best then best = a end
      s = a + 1
    end
  end
  return best and (from + best - 1) or nil
end

local BLOCK_TAGS = { '<div', '<p>', '<p ', '<br', '<hr', '<table' }
local LINE_TAGS = { '<div', '<p>', '<p ', '<br' }

-- Gibt (position, is_reply) zurueck; position = Index, vor dem eingefuegt wird
function M.html_insert_pos(c)
  local lc = c:lower()
  local body = lc:find('<body', 1, true) or 1
  local cands = {}
  local function add(p)
    if p and p >= body then cands[#cands + 1] = p end
  end
  local function find_all(needle, fn)
    local s = body
    while true do
      local a = lc:find(needle, s, true)
      if not a then break end
      add(fn(a))
      s = a + 1
      break -- erstes Vorkommen reicht
    end
  end

  -- Outlook (OWA, neues Outlook, Outlook mobil, Outlook fuer Mac)
  find_all('id="appendonsend"', function(a) return tag_start(lc, a) end)
  find_all('id="divrplyfwdmsg"', function(a)
    local ts = tag_start(lc, a)
    local hr = last_tag_before(lc, ts, 300, { '<hr' })
    local gt = hr and lc:find('>', hr, true)
    if gt and gt < ts and only_markup(lc:sub(gt + 1, ts - 1)) then return hr end
    return ts
  end)
  find_all('id="mail-editor-reference-message-container"', function(a) return tag_start(lc, a) end)
  -- Outlook Desktop (Word-HTML): <div style="border:none;border-top:solid #E1E1E1 1.0pt;padding:3.0pt 0cm 0cm 0cm">
  do
    local a = lc:find('border%-top:%s*solid%s+#%x+%s+1%.0pt;%s*padding:%s*3%.0pt%s+0', body)
    if a then add(tag_start(lc, a)) end
  end
  -- Gmail, Thunderbird, Roundcube, Yahoo, Zimbra
  find_all('class="gmail_quote', function(a) return tag_start(lc, a) end)
  find_all('class="moz-cite-prefix"', function(a) return tag_start(lc, a) end)
  find_all('class="moz-forward-container"', function(a) return tag_start(lc, a) end)
  find_all('id="reply-intro"', function(a) return tag_start(lc, a) end)
  find_all('class="yahoo_quoted"', function(a) return tag_start(lc, a) end)
  find_all('<hr id="zwchr"', function(a) return a end)

  -- Apple Mail, iOS, SOGo und generische Zitate: <blockquote type="cite">
  for _, needle in ipairs({ '<blockquote type="cite"', '<blockquote type=cite' }) do
    find_all(needle, function(a)
      local seg_from = math.max(body, a - 800)
      local seg = lc:sub(seg_from, a - 1)
      local kpos
      for _, kw in ipairs(ATTRIBUTION) do
        local s = 1
        while true do
          local k = seg:find(kw, s, true)
          if not k then break end
          if not kpos or k > kpos then kpos = k end
          s = k + 1
        end
      end
      if kpos then
        -- nur eine echte Attributionszeile ("... schrieb X <x@y>:") direkt vor dem Zitat
        local k = seg_from + kpos - 1
        local tail = trim(lc:sub(k, a - 1):gsub('<[^>]*>', ''):gsub('&[%w#]+;', ' '))
        if #tail <= 200 and tail:find(':', 1, true) then
          local t = last_tag_before(lc, k, 600, LINE_TAGS)
          if t and t >= seg_from then return t end
        end
      end
      return a
    end)
  end

  -- Textuelle Trenner ("-----Ursprüngliche Nachricht-----" usw.)
  for _, m in ipairs(HTML_TEXT_MARKERS) do
    find_all(m, function(a)
      local t = last_tag_before(lc, a, 400, BLOCK_TAGS)
      if t then
        local gt = lc:find('>', t, true)
        if gt and gt < a and only_markup(lc:sub(gt + 1, a - 1)) then return t end
      end
      return a
    end)
  end

  local best
  for _, p in ipairs(cands) do
    if not best or p < best then best = p end
  end
  if best then return best, true end

  -- Neue Nachricht: vor </body> bzw. ans Ende
  local last_body
  local s = 1
  while true do
    local a = lc:find('</body', s, true)
    if not a then break end
    last_body, s = a, a + 1
  end
  return last_body or (#c + 1), false
end

local PLAIN_SEPARATORS = {
  '^%-%-%-%-%-+%s*original message', '^%-%-%-%-%-+%s*urspr', '^%-%-%-%-%-+%s*forwarded message',
  '^%-%-%-%-%-+%s*weitergeleitete nachricht', '^%-%-%-%-%-+%s*originalnachricht',
  '^begin forwarded message:', '^anfang der weitergeleiteten nachricht',
}

local function has_attribution(l)
  for _, kw in ipairs(ATTRIBUTION) do
    if l:find(kw, 1, true) then return true end
  end
  return false
end

function M.plain_insert_pos(c)
  local lines = {}
  local pos = 1
  while pos <= #c do
    local e = c:find('\n', pos, true)
    local line = e and c:sub(pos, e - 1) or c:sub(pos)
    lines[#lines + 1] = { start = pos, text = (line:gsub('\r$', '')):lower() }
    pos = e and e + 1 or #c + 1
  end
  for i, l in ipairs(lines) do
    local t = l.text
    for _, pat in ipairs(PLAIN_SEPARATORS) do
      if t:find(pat) then return l.start, true end
    end
    -- Outlook: "________________________________" gefolgt von From:/Von:
    if t:find('^_____+%s*$') then
      for k = i + 1, math.min(i + 2, #lines) do
        local n = lines[k].text
        if n:find('^from:') or n:find('^von:') or n:find('^de :') or n:find('^de:') then
          return l.start, true
        end
      end
    end
    -- Outlook-Textalternative: Kopfblock "Von: / Gesendet:" ohne Trennlinie
    if t:find('^from:%s') or t:find('^von:%s') then
      for k = i + 1, math.min(i + 3, #lines) do
        local n = lines[k].text
        if n:find('^sent:') or n:find('^gesendet:') or n:find('^date:') or n:find('^datum:') then
          return l.start, true
        end
      end
    end
    if t:sub(1, 1) == '>' then
      -- Zitatblock: Attributionszeile ("Am ... schrieb X:") davor suchen
      local k, seen = i - 1, 0
      while k >= 1 and seen < 3 do
        if trim(lines[k].text) ~= '' then
          seen = seen + 1
          if has_attribution(lines[k].text) then
            local start = k
            -- "wrote:" auf eigener Zeile -> vorherige Zeile gehoert dazu
            if #trim(lines[k].text) < 16 and k > 1 and trim(lines[k - 1].text) ~= '' then start = k - 1 end
            return lines[start].start, true
          end
        end
        k = k - 1
      end
      return l.start, true
    end
  end
  return #c + 1, false
end

---------------------------------------------------------------------------
-- Vorlagen
---------------------------------------------------------------------------

local function html_escape(s)
  return (tostring(s):gsub('&', '&amp;'):gsub('<', '&lt;'):gsub('>', '&gt;'):gsub('"', '&quot;'))
end

function M.render(tpl, vars, is_html)
  local function lookup(k)
    local v = vars[k]
    if v == nil then
      local lk = k:lower()
      for vk, vv in pairs(vars) do
        if vk:lower() == lk then v = vv break end
      end
    end
    return v
  end
  tpl = tpl:gsub('{{#([%w_]+)}}(.-){{/%1}}', function(k, inner)
    return nonempty(lookup(k)) and inner or ''
  end)
  tpl = tpl:gsub('{{%^([%w_]+)}}(.-){{/%1}}', function(k, inner)
    return nonempty(lookup(k)) and '' or inner
  end)
  local function subst(k)
    local v = lookup(k)
    if not nonempty(v) then return '' end
    return is_html and html_escape(v) or tostring(v)
  end
  tpl = tpl:gsub('{{([%w_]+)}}', subst)
  tpl = tpl:gsub('%%%%([%w_]+)%%%%', subst) -- M365-Stil: %%DisplayName%%
  return tpl
end

local function text_to_html(t)
  return (html_escape(t):gsub('\r?\n', '<br>\n'))
end

local function html_to_text(h)
  h = h:gsub('\r', ''):gsub('<!%-%-.-%-%->', ''):gsub('<style.-</style>', '')
  h = h:gsub('[\n\t ]+', ' ')
  h = h:gsub('<[bB][rR][^>]*>', '\n'):gsub('</[pP]>', '\n'):gsub('</[dD][iI][vV]>', '\n'):gsub('</[tT][rR]>', '\n')
  h = h:gsub('<[^>]*>', '')
  h = h:gsub('&nbsp;', ' '):gsub('&lt;', '<'):gsub('&gt;', '>'):gsub('&quot;', '"'):gsub('&amp;', '&')
  h = h:gsub(' *\n *', '\n'):gsub('\n\n\n+', '\n\n')
  return trim(h)
end

-- Lange HTML-Zeilen umbrechen (7bit/8bit: max. 998 Bytes pro Zeile)
local function wrap_html(h, nl)
  local out = {}
  for line in (h .. '\n'):gmatch('([^\n]*)\n') do
    while #line > 900 do
      local cut = line:find('>', 700, true) or line:find(' ', 700, true)
      if not cut or cut > 980 then break end
      out[#out + 1] = line:sub(1, cut)
      line = line:sub(cut + 1)
    end
    out[#out + 1] = line
  end
  return table.concat(out, nl)
end

---------------------------------------------------------------------------
-- Kern: Signatur in eine Nachricht einfuegen (rein funktional, testbar)
--
-- opts.get_templates(kind) -> html, text   (kind = 'new' | 'reply')
-- opts.vars                -> Platzhalterwerte
-- opts.skip_calendar
-- Rueckgabe: neue_nachricht oder nil, grund
---------------------------------------------------------------------------

local function normalize_nl(s, nl)
  return (s:gsub('\r\n', '\n'):gsub('\r', '\n'):gsub('\n', nl))
end

local function decode(node, raw)
  if node.cte == 'base64' then return M.b64_decode(raw) end
  if node.cte == 'quoted-printable' then return M.qp_decode(raw) end
  return raw
end

local function encode(cte, data, nl)
  if cte == 'base64' then return M.b64_encode(data, nl) end
  if cte == 'quoted-printable' then return M.qp_encode(data, nl) end
  return data
end

local function long_lines(s)
  for line in (s .. '\n'):gmatch('([^\n]*)\n') do
    if #line > 998 then return true end
  end
  return false
end

function M.apply(msg, opts)
  local nl = msg:find('\r\n', 1, true) and '\r\n' or '\n'
  local root = M.parse_entity(msg, 1, #msg, 0, true)
  local ctx = M.walk(root)
  if ctx.forbidden then return nil, 'skip: ' .. ctx.forbidden end
  if ctx.broken then return nil, 'skip: malformed MIME' end
  if ctx.calendar and opts.skip_calendar then return nil, 'skip: calendar' end
  if not ctx.html and not ctx.plain then return nil, 'skip: no text body' end

  local is_reply = root.hdr['in-reply-to'] ~= nil or root.hdr['references'] ~= nil
  local jobs = {}
  for _, key in ipairs({ 'html', 'plain' }) do
    local node = ctx[key]
    if node then
      local class = charset_class(node.params.charset)
      if class and (node.cte == '7bit' or node.cte == '8bit' or node.cte == 'binary'
          or node.cte == 'base64' or node.cte == 'quoted-printable') then
        local raw = msg:sub(node.bs, node.be)
        local content = decode(node, raw)
        if content:find('-----BEGIN PGP', 1, true) then return nil, 'skip: inline PGP' end
        local job = { node = node, class = class, raw = raw, content = content, html = node.ct == 'text/html' }
        local reply
        if job.html then
          job.pos, reply = M.html_insert_pos(content)
          if content:sub(1, job.pos - 1):find('data-mcsig', 1, true) then
            return nil, 'skip: signature already present'
          end
        else
          job.pos, reply = M.plain_insert_pos(content)
        end
        job.before = content:sub(1, job.pos - 1)
        is_reply = is_reply or reply
        jobs[#jobs + 1] = job
      end
    end
  end
  if #jobs == 0 then return nil, 'skip: unsupported charset/encoding' end

  local ctx_jobs_html = {}
  for _, job in ipairs(jobs) do
    if job.html then ctx_jobs_html[#ctx_jobs_html + 1] = job end
  end
  local kind = is_reply and 'reply' or 'new'
  local tpl_html, tpl_text = opts.get_templates(kind)
  if not tpl_html and not tpl_text then return nil, 'skip: no template' end
  if tpl_html and trim(tpl_html) == '' then tpl_html = nil end
  if tpl_text and trim(tpl_text) == '' then tpl_text = nil end
  if not tpl_html and not tpl_text then return nil, 'skip: empty ' .. kind .. ' template' end

  local sig_html = tpl_html and M.render(tpl_html, opts.vars, true)
    or text_to_html(M.render(tpl_text, opts.vars, false))
  local sig_text = tpl_text and M.render(tpl_text, opts.vars, false)
    or html_to_text(M.render(tpl_html, opts.vars, true))
  sig_text = trim(sig_text:gsub('[ \t]+\r?\n', '\n'):gsub('[ \t]+$', ''))

  for _, job in ipairs(jobs) do
    local node, c = job.node, job.content
    local cnl = c:find('\r\n', 1, true) and '\r\n' or (c:find('\n', 1, true) and '\n' or nl)
    local new_cte, new_charset = node.cte, nil
    local insert

    if job.html then
      -- HTML: Nicht-ASCII immer als Entities -> funktioniert in jedem ASCII-kompatiblen Zeichensatz
      insert = wrap_html('<div class="mcsig" data-mcsig="1">' .. cnl .. M.to_entities(sig_html) .. cnl .. '</div>', cnl)
      insert = normalize_nl(insert, cnl)
      c = c:sub(1, job.pos - 1) .. cnl .. insert .. cnl .. c:sub(job.pos)
    else
      local function squash(x) return (x:gsub('%s+', ' ')) end
      if #ctx_jobs_html == 0 and squash(job.before):find(squash(sig_text), 1, true) then
        return nil, 'skip: signature already present'
      end
      local t = sig_text
      local seven = node.cte == '7bit'
      if job.class == 'utf8' then
        if seven and has_8bit(t) then
          if node.top then t = M.to_ascii(t) else new_cte = 'quoted-printable' end
        end
      elseif job.class == 'ascii' then
        if has_8bit(t) then
          if node.top then
            t = M.to_ascii(t)
          else
            new_charset = 'utf-8'
            if seven then new_cte = 'quoted-printable' end
          end
        end
      elseif job.class == 'latin1' or job.class == 'cp1252' or job.class == 'latin9' then
        t = to_single_byte(t, (job.class == 'cp1252' and 0x80) or (job.class == 'latin9' and 0xA4) or nil)
        if seven and has_8bit(t) then
          if node.top then t = M.to_ascii(sig_text) else new_cte = 'quoted-printable' end
        end
      else
        t = M.to_ascii(t)
      end
      if (job.node.params.format or ''):lower() == 'flowed' then
        t = t:gsub('\n([ >])', '\n %1'):gsub('\nFrom ', '\n From ')
        if t:find('^[ >]') or t:find('^From ') then t = ' ' .. t end
      end
      t = normalize_nl(t, cnl)
      local before, after = c:sub(1, job.pos - 1), c:sub(job.pos)
      before = before:gsub('%s+$', '')
      if job.pos > #c then
        c = before .. cnl .. cnl .. t .. cnl
      elseif before == '' then
        c = t .. cnl .. cnl .. after
      else
        c = before .. cnl .. cnl .. t .. cnl .. cnl .. after
      end
    end

    if (new_cte == '7bit' or new_cte == '8bit' or new_cte == 'binary') and long_lines(c) then
      if node.top then return nil, 'skip: line too long for ' .. new_cte end
      new_cte = 'quoted-printable'
    end
    if new_cte == '7bit' and has_8bit(c) and not has_8bit(job.content) then
      if node.top then return nil, 'skip: 8bit data in 7bit part' end
      new_cte = 'quoted-printable'
    end

    if new_cte == 'quoted-printable' then c = normalize_nl(c, nl) end
    local enc = encode(new_cte, c, nl)
    -- Selbsttest: Dekodieren muss exakt den neuen Inhalt ergeben
    local check = decode({ cte = new_cte }, enc)
    if new_cte == 'quoted-printable' then check = normalize_nl(check, nl) end
    if check ~= c then return nil, 'skip: encoder self-test failed' end

    enc = enc:gsub('[\r\n]+$', '')
    if job.raw:find('\n$') then enc = enc .. nl end
    job.new_body = enc
    if new_cte ~= node.cte or new_charset then
      local h = msg:sub(node.hs, node.he)
      if new_cte ~= node.cte then h = set_header(h, 'Content-Transfer-Encoding', new_cte, nl) end
      if new_charset then h = set_header(h, 'Content-Type', build_ct(node.ct, node.params, new_charset), nl) end
      job.new_header = h
    end
  end

  -- Von hinten nach vorne ersetzen, damit Offsets gueltig bleiben
  table.sort(jobs, function(a, b) return a.node.bs > b.node.bs end)
  local out = msg
  for _, job in ipairs(jobs) do
    local node = job.node
    out = out:sub(1, node.bs - 1) .. job.new_body .. out:sub(node.be + 1)
    if job.new_header then
      out = out:sub(1, node.hs - 1) .. job.new_header .. out:sub(node.he + 1)
    end
  end

  -- Ergebnis verifizieren: Struktur muss identisch sein
  local vctx = M.walk(M.parse_entity(out, 1, #out, 0, true))
  if vctx.broken or vctx.forbidden or #vctx.leaves ~= #ctx.leaves then
    return nil, 'skip: verification failed'
  end
  for i, l in ipairs(ctx.leaves) do
    if vctx.leaves[i] ~= l then return nil, 'skip: verification failed' end
  end
  if msg:sub(1, root.he) ~= out:sub(1, root.he) then return nil, 'skip: top-level headers changed' end

  return out, kind
end

---------------------------------------------------------------------------
-- Dateien / Konfiguration (mit Cache, Aenderungen greifen nach cache_ttl)
---------------------------------------------------------------------------

local cache = {}

local function now()
  return os.time()
end

function M.read_file(path, ttl)
  local c = cache[path]
  if c and now() - c.t < (ttl or 60) then return c.data end
  local data
  local f = io.open(path, 'rb')
  if f then
    data = f:read('*a')
    f:close()
  end
  cache[path] = { t = now(), data = data }
  return data
end

local json_cache = {}

local function read_json(path, ttl, parse)
  local data = M.read_file(path, ttl)
  if not data then return nil end
  local jc = json_cache[path]
  if jc and jc.raw == data then return jc.obj end
  local obj = parse(data)
  json_cache[path] = { raw = data, obj = obj }
  return obj
end

local function make_template_loader(base, addr, domain, ttl)
  return function(kind)
    for _, level in ipairs({ addr, domain, 'default' }) do
      local dir = base .. '/templates/' .. level .. '/'
      local nh, nt = M.read_file(dir .. 'new.html', ttl), M.read_file(dir .. 'new.txt', ttl)
      if nh or nt then
        if kind == 'reply' then
          local rh, rt = M.read_file(dir .. 'reply.html', ttl), M.read_file(dir .. 'reply.txt', ttl)
          if rh or rt then return rh, rt end
        end
        return nh, nt
      end
    end
    return nil, nil
  end
end

M.make_template_loader = make_template_loader

function M.build_vars(cfg, users, addr, domain, display_name)
  local vars = {}
  local function merge(t)
    if type(t) ~= 'table' then return end
    for k, v in pairs(t) do
      if type(v) ~= 'table' then vars[k] = v end
    end
  end
  merge((cfg.vars or {})['*'])
  merge((cfg.vars or {})[domain])
  if type(users) == 'table' then
    local u = users[addr]
    if u == nil then
      for k, v in pairs(users) do
        if tostring(k):lower() == addr then u = v break end
      end
    end
    merge(u)
  end
  if not nonempty(vars.DisplayName) then
    vars.DisplayName = nonempty(display_name) and display_name or addr:match('^([^@]+)')
  end
  if not nonempty(vars.FirstName) then vars.FirstName = tostring(vars.DisplayName):match('^(%S+)') end
  if not nonempty(vars.LastName) then vars.LastName = tostring(vars.DisplayName):match('%s(%S+)$') end
  vars.Email = vars.Email or addr
  vars.Domain = domain
  vars.Year = os.date('%Y')
  return vars
end

---------------------------------------------------------------------------
-- rspamd-Anbindung
---------------------------------------------------------------------------

if not rspamd_config then
  return M -- Testmodus (ausserhalb von rspamd)
end

local rspamd_logger = require 'rspamd_logger'
local rspamd_ip = require 'rspamd_ip'
local ucl = require 'ucl'

local function parse_json(data)
  local parser = ucl.parser()
  local ok, err = parser:parse_string(data)
  if not ok then
    rspamd_logger.errx(rspamd_config, '%s: cannot parse JSON: %s', N, err)
    return nil
  end
  return parser:get_object()
end

local function load_config()
  local cfg = {}
  for k, v in pairs(M.defaults) do cfg[k] = v end
  local file = read_json(BASE .. '/config.json', 30, parse_json)
  if type(file) == 'table' then
    for k, v in pairs(file) do cfg[k] = v end
  end
  return cfg
end

local function in_networks(ip, nets)
  if not ip or not ip:is_valid() or type(nets) ~= 'table' then return false end
  for _, net in ipairs(nets) do
    local addr, bits = tostring(net):match('^([^/]+)/?(%d*)$')
    local nip = addr and rspamd_ip.from_string(addr)
    if nip and nip:is_valid() and nip:get_version() == ip:get_version() then
      bits = tonumber(bits) or (ip:get_version() == 4 and 32 or 128)
      if ip:apply_mask(bits):to_string() == nip:apply_mask(bits):to_string() then return true end
    end
  end
  return false
end

local function process(task)
  local cfg = load_config()
  if not cfg.enabled then return end

  local from = task:get_from('mime')
  if not from or not from[1] or not from[1].addr or from[1].addr == '' then return end
  local addr = from[1].addr:lower()
  local domain = (from[1].domain or addr:match('@(.+)$') or ''):lower()

  -- Gruende fuers Ueberspringen nur fuer eigene Domains loggen (sonst waere jede
  -- eingehende Mail im Log)
  local own = list_has(cfg.domains, domain)
  local function skip(reason)
    if own then
      task:insert_result(SYMBOL, 0.0, 'skip: ' .. reason)
      rspamd_logger.warnx(task, '%s: %s unchanged (skip: %s)', N, addr, reason)
    end
  end

  local env = task:get_from('smtp')
  if not env or not env[1] or not env[1].addr or env[1].addr == '' then return skip('bounce (empty envelope sender)') end

  -- Nur ausgehende Mails: authentifiziert (SMTP-AUTH/SOGo) oder aus trusted_networks
  local user = task:get_user()
  local trusted = false
  if not user then
    if cfg.require_auth and not in_networks(task:get_from_ip(), cfg.trusted_networks) then
      return skip('sender not authenticated')
    end
    trusted = true
  end

  local all_domains = list_has(cfg.domains, '*')
  if not own and (not all_domains or trusted) then return end
  if list_has(cfg.exclude_senders, addr) then return skip('excluded sender') end

  local auto = task:get_header('Auto-Submitted')
  if auto and not auto:lower():find('^%s*no') then return skip('Auto-Submitted: ' .. auto) end
  local prec = (task:get_header('Precedence') or ''):lower()
  if prec:find('bulk') or prec:find('list') or prec:find('junk') then return skip('Precedence: ' .. prec) end

  if cfg.skip_internal then
    local rcpts = task:get_recipients('smtp') or {}
    local internal = #rcpts > 0
    for _, r in ipairs(rcpts) do
      if not list_has(cfg.internal_domains, (r.domain or ''):lower()) then internal = false break end
    end
    if internal then return skip('internal recipients only') end
  end

  local content = task:get_content()
  if not content then return skip('no message content') end
  local msg = tostring(content)
  if #msg > (tonumber(cfg.max_size) or M.defaults.max_size) then return skip('message too large') end
  if msg:find('-----BEGIN PGP', 1, true) then return skip('inline PGP') end

  local ttl = tonumber(cfg.cache_ttl) or 60
  local users = read_json(BASE .. '/users.json', ttl, parse_json)
  local vars = M.build_vars(cfg, users, addr, domain, from[1].name)

  local out, info = M.apply(msg, {
    get_templates = make_template_loader(BASE, addr, domain, ttl),
    vars = vars,
    skip_calendar = cfg.skip_calendar,
  })
  -- mailcow loggt rspamd im Modus "silent": infox waere unsichtbar, daher warnx.
  -- Zusaetzlich steht das Ergebnis als Symbol in der rspamd-History (mailcow: /rspamd).
  if not out then
    task:insert_result(SYMBOL, 0.0, info)
    rspamd_logger.warnx(task, '%s: %s unchanged (%s)', N, addr, info)
    return
  end
  -- Testmodus: nur live_senders bekommen die Signatur wirklich, alle anderen nur Log
  local live_tester = cfg.dry_run and list_has(cfg.live_senders, addr)
  if cfg.dry_run and not live_tester then
    task:insert_result(SYMBOL, 0.0, 'dry_run: would insert ' .. info)
    rspamd_logger.warnx(task, '%s: dry_run, would insert %s signature for %s', N, info, addr)
    return
  end
  task:set_message(out)
  local how = live_tester and ' (live tester)' or ''
  task:insert_result(SYMBOL, 0.0, 'inserted ' .. info .. how)
  rspamd_logger.warnx(task, '%s: inserted %s signature for %s%s', N, info, addr, how)
end

local id = rspamd_config:register_symbol({
  name = SYMBOL,
  type = 'prefilter',
  priority = 5,
  callback = function(task)
    local ok, err = pcall(process, task)
    if not ok then
      rspamd_logger.errx(task, '%s: error, message left unchanged: %s', N, err)
    end
  end,
  flags = 'empty,nostat',
})

rspamd_config:set_metric_symbol({
  name = SYMBOL,
  score = 0.0,
  group = 'mailcow_signature',
  description = 'Server-side signature inserted',
})

rspamd_logger.warnx(rspamd_config, '%s: loaded (symbol id %s)', N, id)

return M
