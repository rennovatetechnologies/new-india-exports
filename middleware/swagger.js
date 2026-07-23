const path = require('path');
const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');
const config = require('../config');

const specPath = path.join(__dirname, '..', 'docs', 'openapi.yaml');
const openApiSpec = YAML.load(specPath);

function docsEnabled() {
  if (process.env.ENABLE_DOCS === 'true') return true;
  if (process.env.ENABLE_DOCS === 'false') return false;
  return !config.isProduction;
}

function mountSwagger(app) {
  if (!docsEnabled()) {
    console.log('Swagger docs disabled (set ENABLE_DOCS=true to enable)');
    return;
  }

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

module.exports = { mountSwagger, docsEnabled, openApiSpec };
