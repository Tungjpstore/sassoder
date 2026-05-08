module.exports = {
  ci: {
    collect: {
      url: ["http://127.0.0.1:3000/", "http://127.0.0.1:3000/pricing"],
      numberOfRuns: 1,
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
        "robots-txt": "error",
        "structured-data": "warn"
      }
    },
    upload: {
      target: "filesystem",
      outputDir: ".lighthouseci"
    }
  }
};

