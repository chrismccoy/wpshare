const { randomBytes } = require("crypto");
const { KEY_LENGTH, KEY_ALPHABET } = require("../../config");

const BYTE_VALUES = 256;

const createKeyGenerator = ({ length: defaultLength, alphabet }) => {
  if (alphabet.length < 1 || alphabet.length > BYTE_VALUES) {
    throw new RangeError(
      `Key alphabet must have 1 to ${BYTE_VALUES} characters, got ${alphabet.length}`
    );
  }
  const maxValid = Math.floor(BYTE_VALUES / alphabet.length) * alphabet.length;

  return (length = defaultLength) => {
    let key = "";
    while (key.length < length) {
      const bytes = randomBytes(length - key.length + 16);
      for (let i = 0; i < bytes.length && key.length < length; i++) {
        if (bytes[i] < maxValid) {
          key += alphabet[bytes[i] % alphabet.length];
        }
      }
    }
    return key;
  };
};

const generateKey = createKeyGenerator({ length: KEY_LENGTH, alphabet: KEY_ALPHABET });

module.exports = { createKeyGenerator, generateKey };
