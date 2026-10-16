
    // If modules never boot (very old browser / blocked script), explain instead of spinning forever.
    setTimeout(function () {
      var b = document.getElementById('boot'), e = document.getElementById('boot-err');
      if (b && !b.classList.contains('is-done') && e && !e.textContent) e.textContent = '로딩이 오래 걸리고 있습니다. 계속 응답이 없으면 Chrome / Edge / Safari / Firefox를 최신 버전으로 업데이트한 뒤 새로고침하세요.';
    }, 9000);
  