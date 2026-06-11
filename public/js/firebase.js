'use strict';

/*
 * Firestore 同期(REST API・認証なし)
 * セーブデータ全体を misha-saves/{ID} ドキュメントの json フィールド(文字列)に保存する。
 * FIREBASE_CONFIG が空のときはクラウド同期を無効化し、ローカル保存のみで動作する。
 */
const FIREBASE_CONFIG = {
  projectId: '',  // ← Firebaseプロジェクトの projectId
  apiKey: ''      // ← ウェブAPIキー
};

const cloudEnabled = () => !!(FIREBASE_CONFIG.projectId && FIREBASE_CONFIG.apiKey);

function fsDocUrl(id) {
  return 'https://firestore.googleapis.com/v1/projects/' + FIREBASE_CONFIG.projectId +
    '/databases/(default)/documents/misha-saves/' + encodeURIComponent(id) +
    '?key=' + FIREBASE_CONFIG.apiKey;
}

async function cloudLoad(id) {
  if (!cloudEnabled()) return null;
  const res = await fetch(fsDocUrl(id));
  if (res.status === 404) return null;
  if (!res.ok) throw new Error('cloudLoad failed: ' + res.status);
  const doc = await res.json();
  const json = doc.fields && doc.fields.json && doc.fields.json.stringValue;
  if (!json) return null;
  try { return JSON.parse(json); } catch (e) { return null; }
}

async function cloudSave(id, obj) {
  if (!cloudEnabled()) return false;
  const body = {
    fields: {
      json: { stringValue: JSON.stringify(obj) },
      updatedAt: { integerValue: String(Date.now()) }
    }
  };
  const res = await fetch(fsDocUrl(id), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('cloudSave failed: ' + res.status);
  return true;
}
