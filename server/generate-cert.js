/**
 * Generate SSL certificates for WebSocket server using Node.js
 * This creates a self-signed certificate for development/testing
 * Uses the 'selfsigned' package - no OpenSSL required!
 */

import selfsigned from 'selfsigned';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Generating SSL certificates for WebSocket server...\n');

// Create certs directory if it doesn't exist
const certsDir = path.join(__dirname, 'certs');
if (!fs.existsSync(certsDir)) {
  fs.mkdirSync(certsDir, { recursive: true });
}

// Generate self-signed certificate
console.log('Generating self-signed certificate...');
const attrs = [
  { name: 'commonName', value: '31.43.142.49' },
  { name: 'organizationName', value: 'Jonas Review Guesser' },
  { name: 'countryName', value: 'US' }
];

const pems = selfsigned.generate(attrs, {
  keySize: 2048,
  days: 365,
  algorithm: 'sha256',
  extensions: [
    {
      name: 'basicConstraints',
      cA: true,
    },
    {
      name: 'keyUsage',
      keyCertSign: true,
      digitalSignature: true,
      nonRepudiation: true,
      keyEncipherment: true,
      dataEncipherment: true,
    },
    {
      name: 'subjectAltName',
      altNames: [
        {
          type: 2, // DNS
          value: '31.43.142.49',
        },
        {
          type: 7, // IP
          ip: '31.43.142.49',
        },
        {
          type: 2, // DNS
          value: 'localhost',
        },
        {
          type: 7, // IP
          ip: '127.0.0.1',
        },
      ],
    },
  ],
});

// Write certificate files
const keyPath = path.join(certsDir, 'private.key');
const certPath = path.join(certsDir, 'certificate.crt');

fs.writeFileSync(keyPath, pems.private);
fs.writeFileSync(certPath, pems.cert);

console.log('✅ SSL certificates generated successfully!\n');

// Display success message
console.log('Files created:');
console.log(`  - ${keyPath}`);
console.log(`  - ${certPath}`);
console.log('\nTo use these certificates, set environment variables:');
console.log(`  set SSL_KEY_PATH=${keyPath}`);
console.log(`  set SSL_CERT_PATH=${certPath}`);
console.log('\nOr in PowerShell:');
console.log(`  $env:SSL_KEY_PATH="${keyPath}"`);
console.log(`  $env:SSL_CERT_PATH="${certPath}"`);
console.log('\nNote: Self-signed certificates will show a security warning in browsers.');
console.log('This is normal for development/testing purposes.\n');

