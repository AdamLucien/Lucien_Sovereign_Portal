#!/usr/bin/env node
import { randomBytes, scryptSync } from 'node:crypto';

const [, , password] = process.argv;

if (!password) {
  console.error('Usage: node scripts/hash-password.mjs <password>');
  process.exit(1);
}

const salt = randomBytes(16);
const hash = scryptSync(password, salt, 64);

console.log(`scrypt$${salt.toString('base64')}$${hash.toString('base64')}`);
