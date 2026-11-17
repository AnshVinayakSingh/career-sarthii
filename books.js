'use strict';
/* Books Library: admin uploads cover + name + writer + PDF; every user can read. PDFs live in MongoDB GridFS. */
const { pipeline, Transform } = require('node:stream');
const MAX_PDF = 80 * 1024 * 1024, MAX_COVER = 1.5 * 1024 * 1024;
const str = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
module.exports = ctx => {
  let bucket = null; const grid = () => bucket || (bucket = new ctx.GridFSBucket(ctx.db, { bucketName: 'bookfiles' }));
  const oid = s => (/^[a-f0-9]{24}$/.test(String(s || '')) ? new ctx.ObjectId(s) : null);
  const asciiName = t => (str(t, 80).replace(/[^\w\- ]+/g, '').trim() || 'book') + '.pdf';
  async function handle(req, res, url, user) {
    const send = ctx.send, p = url.pathname, col = ctx.books, admin = ctx.isAdmin(user);
    let m;
    /* ---- everyone: list, cover, pdf ---- */
    if (p === '/api/books' && req.method === 'GET') {
      const rows = await col.find({ status: 'ready' }, { projection: { title: 1, author: 1, cover: 1, size: 1, createdAt: 1 } }).sort({ _id: -1 }).limit(500).toArray();
      return send(res, 200, { books: rows.map(r => ({ id: String(r._id), title: r.title, author: r.author, cover: !!r.cover, size: r.size || 0 })), admin });
    }
    if ((m = p.match(/^\/api\/books\/([a-f0-9]{24})\/cover$/)) && req.method === 'GET') {
      const d = await col.findOne({ _id: oid(m[1]) }, { projection: { cover: 1, coverMime: 1 } });
      if (!d || !d.cover) { res.writeHead(404); return res.end(); }
      const buf = Buffer.isBuffer(d.cover) ? d.cover : Buffer.from(d.cover.buffer);
      res.writeHead(200, { 'content-type': d.coverMime || 'image/jpeg', 'cache-control': 'private, max-age=86400', 'content-length': buf.length }); return res.end(buf);
    }
    if ((m = p.match(/^\/api\/books\/([a-f0-9]{24})\/pdf$/)) && req.method === 'GET') {
      const d = await col.findOne({ _id: oid(m[1]), status: 'ready' }, { projection: { pdfId: 1, title: 1, size: 1 } });
      if (!d || !d.pdfId) return send(res, 404, { error: 'Book not found.' });
      const h = { 'content-type': 'application/pdf', 'content-disposition': `inline; filename="${asciiName(d.title)}"`, 'cache-control': 'private, max-age=3600', 'x-content-type-options': 'nosniff' };
      if (d.size) h['content-length'] = d.size;
      res.writeHead(200, h);
      const s = grid().openDownloadStream(d.pdfId); s.on('error', () => res.destroy()); res.on('close', () => s.destroy()); return s.pipe(res);
    }
    /* ---- admin only ---- */
    if (!p.startsWith('/api/admin/books')) return send(res, 404, { error: 'API route not found.' });
    if (!admin) return send(res, 403, { error: 'Admin only.' });
    if (p === '/api/admin/books' && req.method === 'POST') {
      const b = await ctx.readBody(req), title = str(b.title, 150), author = str(b.author, 100);
      if (title.length < 2 || author.length < 2) return send(res, 400, { error: 'Book name and writer name are required.' });
      let cover = null, coverMime = '';
      const dm = String(b.cover || '').match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      if (dm) { cover = Buffer.from(dm[2], 'base64'); coverMime = dm[1]; if (cover.length > MAX_COVER) return send(res, 400, { error: 'Cover image is too large.' }); }
      if (!cover) return send(res, 400, { error: 'Cover image is required.' });
      const r = await col.insertOne({ title, author, cover, coverMime, status: 'pending', by: user._id, createdAt: new Date() });
      return send(res, 201, { id: String(r.insertedId) });
    }
    if ((m = p.match(/^\/api\/admin\/books\/([a-f0-9]{24})\/pdf$/)) && req.method === 'PUT') {
      const id = oid(m[1]), d = await col.findOne({ _id: id }); if (!d) return send(res, 404, { error: 'Book not found.' });
      const len = Number(req.headers['content-length'] || 0); if (len > MAX_PDF) return send(res, 413, { error: 'PDF is too large (max 80 MB).' });
      let size = 0, first = true, bad = '';
      const check = new Transform({ transform(chunk, _e, cb) { if (first) { first = false; if (chunk.subarray(0, 5).toString() !== '%PDF-') { bad = 'This file is not a PDF.'; return cb(new Error(bad)); } } size += chunk.length; if (size > MAX_PDF) { bad = 'PDF is too large (max 80 MB).'; return cb(new Error(bad)); } cb(null, chunk); } });
      const up = grid().openUploadStream(asciiName(d.title), { contentType: 'application/pdf' });
      return pipeline(req, check, up, async err => {
        if (err) { await grid().delete(up.id).catch(() => {}); return send(res, bad ? 400 : 500, { error: bad || 'Upload failed. Please try again.' }); }
        await col.updateOne({ _id: id }, { $set: { pdfId: up.id, size, status: 'ready' } });
        send(res, 200, { ok: true });
      });
    }
    if ((m = p.match(/^\/api\/admin\/books\/([a-f0-9]{24})$/)) && req.method === 'DELETE') {
      const id = oid(m[1]), d = await col.findOne({ _id: id }, { projection: { pdfId: 1 } });
      if (d && d.pdfId) await grid().delete(d.pdfId).catch(() => {});
      await col.deleteOne({ _id: id }); return send(res, 200, { ok: true });
    }
    return send(res, 404, { error: 'API route not found.' });
  }
  return { handle };
};
