if ("serviceWorker" in navigator) {
  // Remove the old /public/-scoped worker (cache v6) left in returning visitors' browsers.
  navigator.serviceWorker.getRegistrations().then(function (regs) {
    regs.forEach(function (r) {
      if (/\/public\/$/.test(r.scope)) r.unregister();
    });
  }).catch(function () {});
  navigator.serviceWorker.register("/service-worker.js").catch(function () {});
}
