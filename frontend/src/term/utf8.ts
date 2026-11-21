export class Utf8Decoder {
  private pending: number[] = [];

  decode(chunk: Uint8Array): string {
    let bytes: ArrayLike<number> = chunk;
    if (this.pending.length) {
      const merged = new Uint8Array(this.pending.length + chunk.length);
      merged.set(this.pending, 0);
      merged.set(chunk, this.pending.length);
      bytes = merged;
      this.pending = [];
    }
    const n = bytes.length;
    // niedokończona sekwencja na końcu → zatrzymaj do następnej porcji
    let end = n;
    for (let back = 1; back <= 3 && n - back >= 0; back++) {
      const b = bytes[n - back];
      if ((b & 0xc0) === 0x80) continue;                         // bajt kontynuacji — szukaj dalej wstecz
      const need = b >= 0xf0 ? 4 : b >= 0xe0 ? 3 : b >= 0xc0 ? 2 : 1;
      if (need > back) end = n - back;
      break;
    }
    for (let i = end; i < n; i++) this.pending.push(bytes[i]);

    const parts: string[] = [];
    let ascii = '';
    let i = 0;
    const flush = () => { if (ascii) { parts.push(ascii); ascii = ''; } };
    while (i < end) {
      const c = bytes[i];
      if (c < 0x80) { ascii += String.fromCharCode(c); i++; if (ascii.length > 4096) flush(); continue; }
      let need = 0, cp = 0;
      if (c >= 0xc2 && c < 0xe0) { need = 1; cp = c & 0x1f; }
      else if (c >= 0xe0 && c < 0xf0) { need = 2; cp = c & 0x0f; }
      else if (c >= 0xf0 && c < 0xf5) { need = 3; cp = c & 0x07; }
      else { ascii += '�'; i++; continue; }
      let ok = i + need < end + 0 || i + need <= end - 0;
      let j = 1;
      for (; j <= need; j++) {
        const b = i + j < end ? bytes[i + j] : -1;
        if (b < 0 || (b & 0xc0) !== 0x80) { ok = false; break; }
        cp = (cp << 6) | (b & 0x3f);
      }
      if (!ok || cp > 0x10ffff || (cp >= 0xd800 && cp < 0xe000)) { ascii += '�'; i += Math.max(1, j); continue; }
      ascii += String.fromCodePoint(cp);
      i += need + 1;
    }
    flush();
    return parts.join('');
  }
}
