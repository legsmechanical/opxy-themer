// A small strict XML parser for the OP-XY's Illustrator-made screen SVGs, building just enough of a DOM for the
// engine (localName, attributes, childNodes, parentNode, textContent). The browser's DOMParser plus real DOM
// traversal made each rebuild take 1-2 s; this keeps it fast and behaves the same in node and the browser.
// Like expat (Python's ElementTree), it rejects mismatched tags, undefined entities and stray markup, and
// normalises whitespace in attribute values. Exports are still re-validated with the browser's own parser.

const PREDEFINED = {lt: '<', gt: '>', amp: '&', quot: '"', apos: "'"};
const NAME = /[A-Za-z_:][\w:.-]*/y;
const ATTR = /\s+([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"<]*)"|'([^'<]*)')/y;

export class XMLError extends Error {}

function decode(s, where) {
  return s.replace(/&(#x[0-9A-Fa-f]+|#\d+|\w+);?/g, (m, e) => {
    if (!m.endsWith(';')) throw new XMLError(`bare & ${where}`);
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    if (e in PREDEFINED) return PREDEFINED[e];
    throw new XMLError(`undefined entity &${e}; ${where}`);
  });
}

class Text {
  constructor(data) { this.nodeType = 3; this.data = data; }
  get textContent() { return this.data; }
}

class Element {
  constructor(name, parent) {
    this.nodeType = 1;
    this.nodeName = name;
    this.localName = name.slice(name.indexOf(':') + 1);
    this.attributes = [];
    this.map = new Map();
    this.childNodes = [];
    this.parentNode = parent;
  }
  getAttribute(k) { return this.map.has(k) ? this.map.get(k) : null; }
  hasAttribute(k) { return this.map.has(k); }
  get textContent() { return this.childNodes.map(c => c.textContent).join(''); }
}

export function parseXML(src) {
  const s = src.replace(/\r\n?/g, '\n');
  let i = 0, root = null, cur = null;
  const fail = msg => { throw new XMLError(`${msg} (line ${s.slice(0, i).split('\n').length})`); };
  const text = t => {
    if (!t) return;
    if (!cur) { if (t.trim()) fail('text outside the root element'); return; }
    if (t.includes('<')) fail('stray <');
    cur.childNodes.push(new Text(decode(t, 'in text')));
  };
  while (i < s.length) {
    const lt = s.indexOf('<', i);
    if (lt < 0) { text(s.slice(i)); break; }
    text(s.slice(i, lt));
    i = lt;
    if (s.startsWith('<!--', i)) {
      const e = s.indexOf('-->', i + 4);
      if (e < 0) fail('unclosed comment');
      i = e + 3;
    } else if (s.startsWith('<?', i)) {
      const e = s.indexOf('?>', i + 2);
      if (e < 0) fail('unclosed processing instruction');
      i = e + 2;
    } else if (s.startsWith('<![CDATA[', i)) {
      const e = s.indexOf(']]>', i);
      if (e < 0 || !cur) fail('bad CDATA');
      cur.childNodes.push(new Text(s.slice(i + 9, e)));
      i = e + 3;
    } else if (s.startsWith('<!DOCTYPE', i)) {
      if (root) fail('DOCTYPE after the root element');
      const bracket = s.indexOf('[', i), gt = s.indexOf('>', i);
      if (bracket >= 0 && bracket < gt) fail('DOCTYPE with an internal subset is not supported');
      i = gt + 1;
    } else if (s[i + 1] === '/') {
      NAME.lastIndex = i + 2;
      const m = NAME.exec(s);
      if (!m || !cur || m[0] !== cur.nodeName) fail(`mismatched </${m ? m[0] : ''}>`);
      i = NAME.lastIndex;
      while (/\s/.test(s[i])) i++;
      if (s[i] !== '>') fail('bad end tag');
      i++;
      cur = cur.parentNode;
    } else {
      NAME.lastIndex = i + 1;
      const m = NAME.exec(s);
      if (!m) fail('bad tag');
      if (root && !cur) fail('second root element');
      const el = new Element(m[0], cur);
      i = NAME.lastIndex;
      for (;;) {
        ATTR.lastIndex = i;
        const a = ATTR.exec(s);
        if (!a) break;
        if (el.map.has(a[1])) fail(`duplicate attribute ${a[1]}`);
        const v = decode((a[2] ?? a[3]).replace(/[\t\n]/g, ' '), `in ${a[1]}`);
        el.attributes.push({name: a[1], value: v});
        el.map.set(a[1], v);
        i = ATTR.lastIndex;
      }
      while (/\s/.test(s[i])) i++;
      const selfClose = s[i] === '/';
      if (selfClose) i++;
      if (s[i] !== '>') fail(`bad start tag <${m[0]}>`);
      i++;
      if (cur) cur.childNodes.push(el);
      else root = el;
      if (!selfClose) cur = el;
    }
  }
  if (!root) fail('no root element');
  if (cur) fail(`unclosed <${cur.nodeName}>`);
  return {documentElement: root};
}
