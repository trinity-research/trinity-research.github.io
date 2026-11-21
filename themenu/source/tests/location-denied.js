// Local smoke-test harness only. Never included in the dist artifact.
Object.defineProperty(navigator, 'geolocation', { configurable: true, value: {
  getCurrentPosition(_success, failure) { failure({ code: 1, message: 'Simulated denial' }); }
}});
await import('../assets/app.js');
