// CardHub 公開サイト用の補助スクリプト。
// ページの本文表示・ナビゲーションはこのスクリプトが無くてもすべて機能する
// （CSSとHTMLのみで完結している）。ここでは目次クリック時のスムーズスクロールのみを
// 任意で追加する非必須の拡張であり、トラッキング・外部送信は一切行わない。
(function () {
  if (!('scrollBehavior' in document.documentElement.style)) return;

  document.addEventListener('click', function (event) {
    var target = event.target;
    if (!(target instanceof Element)) return;
    var link = target.closest('a[href^="#"]');
    if (!link) return;

    var id = link.getAttribute('href').slice(1);
    if (!id) return;
    var section = document.getElementById(id);
    if (!section) return;

    event.preventDefault();
    section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', '#' + id);
  });
})();
