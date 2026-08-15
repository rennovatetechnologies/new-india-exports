const fs = require('fs');
const path = require('path');

const LOGO_PATH = path.join(__dirname, 'Logo.png');
const LOGO_CID = 'virastra-logo';
/** Native Logo.png size — keep in sync if the file is replaced. */
const LOGO_WIDTH_PX = 1820;
const LOGO_HEIGHT_PX = 638;
const LOGO_ASPECT = LOGO_HEIGHT_PX / LOGO_WIDTH_PX;

function getLogoPath() {
  return fs.existsSync(LOGO_PATH) ? LOGO_PATH : null;
}

function logoInlineAttachment() {
  const filePath = getLogoPath();
  if (!filePath) return null;
  return {
    filename: 'Logo.png',
    content: fs.readFileSync(filePath),
    contentType: 'image/png',
    cid: LOGO_CID,
    contentDisposition: 'inline',
  };
}

module.exports = {
  LOGO_PATH,
  LOGO_CID,
  LOGO_ASPECT,
  getLogoPath,
  logoInlineAttachment,
};
