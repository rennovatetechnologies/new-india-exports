const fs = require('fs');
const path = require('path');
const config = require('../config');

const specPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');

function docsEnabled() {
  if (process.env.ENABLE_DOCS === 'true') return true;
  if (process.env.ENABLE_DOCS === 'false') return false;
  return Boolean(config.enableDocs);
}

function loadSpec() {
  if (!fs.existsSync(specPath)) return null;
  try {
    const YAML = require('yamljs');
    return YAML.load(specPath);
  } catch (e) {
    console.warn('OpenAPI load failed:', e.message);
    return null;
  }
}

function mountSwagger(app) {
  if (!docsEnabled()) {
    console.log('Swagger docs disabled (set ENABLE_DOCS=true to enable)');
    return;
  }
  const openApiSpec = loadSpec();
  if (!openApiSpec) {
    console.warn('Swagger docs enabled but docs/openapi.yaml missing — skipping');
    return;
  }
  const swaggerUi = require('swagger-ui-express');

  app.get('/openapi.yaml', (req, res) => {
    res.type('text/yaml').sendFile(specPath);
  });

  app.get('/openapi.json', (req, res) => {
    res.json(openApiSpec);
  });

  app.use(
    '/docs',
    swaggerUi.serve,
    swaggerUi.setup(openApiSpec, {
      customSiteTitle: 'New India Exports API',
      swaggerOptions: {
        persistAuthorization: true,
        displayRequestDuration: true,
      },
    })
  );

  app.get('/api-docs', (req, res) => res.redirect('/docs'));
  console.log(`Swagger UI at http://127.0.0.1:${config.port}/docs`);
}

module.exports = { mountSwagger, docsEnabled, loadSpec };
