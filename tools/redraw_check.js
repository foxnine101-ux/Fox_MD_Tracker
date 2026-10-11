// ブラウザのコンソール(または自動操作の javascript_tool)で実行: 自動の読み直しで画面を描き直さないことの確認
// 結果が { kept: true, redrawn: true } なら正常(自動 load(true) は描き直さず、手動 load() は描き直す)
(async () => {
  await new Promise((r) => setTimeout(r, 1500));
  const first = document.querySelector("#view").firstElementChild;
  for (let i = 0; i < 3; i++) { await load(true); await new Promise((r) => setTimeout(r, 1200)); }
  const kept = document.querySelector("#view").firstElementChild === first;
  await load();
  const redrawn = document.querySelector("#view").firstElementChild !== first;
  return { kept, redrawn };
})();
