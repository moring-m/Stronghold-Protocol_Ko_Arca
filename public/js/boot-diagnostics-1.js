
    // Boot diagnostics (plain ES5: runs everywhere). A browser too old for the app says so instead of spinning forever:
    // no ES modules (nomodule below), a module graph that cannot load (e.g. import maps: Safari / iOS < 16.4), or no
    // boot after 9 s.
    window.__spBootFail = function (why) {
      var e = document.getElementById('boot-err');
      if (!e || e.getAttribute('data-final')) return;
      var im = false;
      try { im = !!(window.HTMLScriptElement && HTMLScriptElement.supports && HTMLScriptElement.supports('importmap')); } catch (x) { im = false; }
      e.textContent = why === 'old' || !im
        ? '브라우저가 오래되어 게임을 실행할 수 없습니다. iOS / iPadOS 16.4+(Safari 16.4+), Chrome / Edge 90+ 또는 Firefox 108+로 업데이트한 후 새로고침하세요.'
        : '게임 스크립트를 불러오지 못했습니다. 네트워크 연결을 확인한 후 새로고침하세요.';
      e.setAttribute('data-final', '1');
    };
    // a module graph that fails to link (bare specifier without import-map support) reports here, not on the <script>
    window.addEventListener('error', function (ev) {
      var b = document.getElementById('boot');
      if (!b || b.classList.contains('is-done')) return;
      if (/specifier|resolve|import|module/i.test(String(ev && ev.message))) window.__spBootFail('load');
    });
  