import { getStore } from '@netlify/blobs';

const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'Content-Type': 'application/json' } });
const slug = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 80);
const clip = (s, n) => String(s ?? '').slice(0, n);

export default async (req) => {
  const store = getStore('lkpd');
  const u = new URL(req.url);
  const pin = Netlify.env.get('GURU_PIN');
  const isGuru = !!pin && req.headers.get('x-pin') === pin;

  // Siswa mengirim LKPD
  if (req.method === 'POST') {
    const b = await req.json().catch(() => null);
    if (!b || !b.nama || !b.kelas || !Array.isArray(b.rows)) return J({ error: 'Data tidak lengkap' }, 400);
    const id = slug(b.kelas) + '_' + slug(b.nama);
    const rec = {
      id, nama: clip(b.nama, 60), kelas: clip(b.kelas, 30),
      rows: b.rows.slice(0, 60).map(r => ({ k: clip(r.k, 80), q: clip(r.q, 200), a: clip(r.a, 1500) })),
      sentAt: new Date().toISOString(), nilai: null, komentar: ''
    };
    await store.setJSON(id, rec);
    return J({ id });
  }

  if (req.method === 'GET') {
    // Guru: daftar semua LKPD
    if (u.searchParams.get('all')) {
      if (!isGuru) return J({ error: 'PIN salah' }, 401);
      const { blobs } = await store.list();
      const all = await Promise.all(blobs.map(b => store.get(b.key, { type: 'json' })));
      return J(all.filter(Boolean).sort((a, b) => b.sentAt.localeCompare(a.sentAt)));
    }
    // Siswa: cek nilai sendiri
    const id = slug(u.searchParams.get('kelas')) + '_' + slug(u.searchParams.get('nama'));
    const r = await store.get(id, { type: 'json' });
    if (!r) return J({ error: 'LKPD belum ditemukan. Pastikan Nama dan Kelas sama seperti saat mengirim.' }, 404);
    return J({ nilai: r.nilai, komentar: r.komentar, sentAt: r.sentAt });
  }

  // Guru: simpan nilai dan komentar
  if (req.method === 'PUT') {
    if (!isGuru) return J({ error: 'PIN salah' }, 401);
    const b = await req.json().catch(() => null);
    const r = b && await store.get(String(b.id), { type: 'json' });
    if (!r) return J({ error: 'Tidak ditemukan' }, 404);
    const n = Number(b.nilai);
    r.nilai = (b.nilai === '' || b.nilai == null || isNaN(n)) ? null : Math.max(0, Math.min(100, n));
    r.komentar = clip(b.komentar, 500);
    await store.setJSON(r.id, r);
    return J({ ok: 1 });
  }

  return J({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/lkpd' };
