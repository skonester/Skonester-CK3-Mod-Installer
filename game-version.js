const gameVersion = '1.21';
const ck3 = Object.freeze({
  version: gameVersion,
  codename: 'Florin',
  descriptorVersion: gameVersion + '.*'
});

if (typeof module === 'object' && module.exports) {
  module.exports = ck3;
}
