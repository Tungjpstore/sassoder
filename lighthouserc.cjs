module.exports = {
  ci: {
    collect: {
      url: [
        "http://127.0.0.1:3000/",
        "http://127.0.0.1:3000/pricing",
        "http://127.0.0.1:3000/blog",
        "http://127.0.0.1:3000/blog/goi-mon-qr",
        "http://127.0.0.1:3000/blog/phan-mem-goi-mon-qr-cho-quan-cafe",
        "http://127.0.0.1:3000/blog/menu-qr-la-gi",
        "http://127.0.0.1:3000/blog/order-tai-ban-khong-can-app"
      ],
      numberOfRuns: 1,
      startServerCommand: "npm run start -- --hostname 127.0.0.1 --port 3000",
      startServerReadyPattern: "Ready",
      startServerReadyTimeout: 60000,
      settings: {
        chromeFlags: "--headless=new --no-sandbox --disable-dev-shm-usage"
      }
    },
    assert: {
      assertions: {
        "categories:seo": ["error", { minScore: 0.9 }],
        "categories:performance": ["error", { minScore: 0.85 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "canonical": "error",
        "document-title": "error",
        "meta-description": "error",
        "robots-txt": "error"
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci"
    }
  }
};
