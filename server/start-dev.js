/**
 * Start development server with auto-generated certificates
 * Generates certificates if they don't exist, then starts the server
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import selfsigned from 'selfsigned';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const certsDir = path.join(__dirname, 'certs');
const keyPath = path.join(certsDir, 'private.key');
const certPath = path.join(certsDir, 'certificate.crt');

// Check if certificates exist
const certsExist = fs.existsSync(keyPath) && fs.existsSync(certPath);

if (!certsExist) {
  console.log('Certificates not found. Generating new certificates...\n');
  
  // Generate certificates
  try {
    
    // Create certs directory if it doesn't exist
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
    fs.writeFileSync(keyPath, pems.private);
    fs.writeFileSync(certPath, pems.cert);
    
    console.log('✅ Certificates generated successfully!\n');
  } catch (error) {
    console.error('❌ Error generating certificates:', error.message);
    process.exit(1);
  }
} else {
  console.log('Using existing certificates.\n');
}

// Set environment variables
process.env.SSL_KEY_PATH = keyPath;
process.env.SSL_CERT_PATH = certPath;
// Set default port to 443 if not already set
if (!process.env.PORT) {
  process.env.PORT = '443';
}

console.log('Starting development server...');
console.log(`PORT: ${process.env.PORT}`);
console.log(`SSL_KEY_PATH: ${keyPath}`);
console.log(`SSL_CERT_PATH: ${certPath}\n`);

// Start the dev server
const devProcess = spawn('node', ['--watch', 'server.js'], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    SSL_KEY_PATH: keyPath,
    SSL_CERT_PATH: certPath,
  }
});

devProcess.on('error', (error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

devProcess.on('exit', (code) => {
  process.exit(code || 0);
});

