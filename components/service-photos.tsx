'use client';
import {useEffect, useRef, useState} from 'react';

const MAX_BYTES = 5 * 1024 * 1024;
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export default function ServicePhotos({fileIds}: {fileIds: string[]}) {
  const [visible, setVisible] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [photos, setPhotos] = useState<{id: string; url?: string; error?: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const pending = useRef(false);
  const idsKey = JSON.stringify([...new Set(fileIds.filter(id => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id)))].slice(0, 5));

  useEffect(() => {
    if (!visible) return;
    const ids = JSON.parse(idsKey) as string[];
    const controller = new AbortController();
    const urls: string[] = [];
    let active = true;
    pending.current = true;
    setPhotos([]);
    setLoading(true);
    async function load() {
      // At most five bounded downloads, only after the user's click.
      for (const id of ids) {
        try {
          const response = await fetch('/api/files/' + encodeURIComponent(id), {signal: controller.signal, cache: 'no-store'});
          if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'Photo could not be loaded.');
          }
          const type = (response.headers.get('content-type') || '').split(';')[0];
          if (!IMAGE_TYPES.includes(type) || Number(response.headers.get('content-length')) > MAX_BYTES || !response.body) {
            await response.body?.cancel();
            throw new Error('Unsupported image or file exceeds 5 MB.');
          }
          const reader = response.body.getReader();
          const chunks: ArrayBuffer[] = [];
          let size = 0;
          while (true) {
            const next = await reader.read();
            if (next.done) break;
            size += next.value.byteLength;
            if (size > MAX_BYTES) { await reader.cancel(); throw new Error('Photo exceeds 5 MB.'); }
            chunks.push(new Uint8Array(next.value).buffer);
          }
          if (!active) return;
          const url = URL.createObjectURL(new Blob(chunks, {type}));
          urls.push(url);
          setPhotos(current => [...current, {id, url}]);
        } catch (error: any) {
          if (!active || controller.signal.aborted || error?.name === 'AbortError') return;
          setPhotos(current => [...current, {id, error: error instanceof Error ? error.message : 'Photo unavailable.'}]);
        }
      }
      if (active) { pending.current = false; setLoading(false); }
    }
    void load();
    return () => { active = false; pending.current = false; controller.abort(); urls.forEach(url => URL.revokeObjectURL(url)); };
  }, [visible, idsKey, attempt]);

  const count = (JSON.parse(idsKey) as string[]).length;
  if (!count) return <p className="muted">No photos attached.</p>;
  return <div>
    <button type="button" className="btn secondary" aria-expanded={visible} onClick={() => setVisible(value => !value)}>
      {visible ? 'Hide photos' : `Show photos (${count})`}
    </button>
    {!visible && <p className="muted">Photos load only when you choose to view them.</p>}
    {visible && <>
      {loading && <p role="status">Loading photos…</p>}
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 12}}>
        {photos.map((photo, index) => <div key={photo.id}>
          {photo.url ? <a href={photo.url} target="_blank" rel="noreferrer"><img src={photo.url} alt={`Service evidence photo ${index + 1}`} style={{width: '100%', maxHeight: 280, objectFit: 'contain', borderRadius: 8}} onError={() => setPhotos(current => current.map(p => p.id === photo.id ? {...p, url: undefined, error: 'This file could not be displayed as an image.'} : p))}/></a> : <p role="alert">Photo {index + 1}: {photo.error}</p>}
        </div>)}
      </div>
      {!loading && photos.some(photo => photo.error) && <button type="button" className="btn secondary" onClick={() => {if (!pending.current) setAttempt(value => value + 1);}}>Retry photos</button>}
    </>}
  </div>;
}
