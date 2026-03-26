import * as dotenv from 'dotenv';
dotenv.config();
import { connect } from 'mongoose';
import * as bcrypt from 'bcrypt';
import * as fs from 'fs';
import * as path from 'path';

async function seed() {
  const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/eventsh_dev';
  await connect(MONGO);
  console.log('Connected to Mongo for seeding');
  const User = (await import('../modules/users/schemas/user.schema')).User;
  const mongoose = await import('mongoose');
  const UserModel = mongoose.model('User', (await import('../modules/users/schemas/user.schema')).UserSchema);

  const existing = await UserModel.findOne({ email: 'admin@kioscart.com' }).exec();
  if (existing) {
    console.log('Admin user already exists');
    process.exit(0);
  }
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('admin123', salt);
  await UserModel.create({ email: 'admin@kioscart.com', password: hash, name: 'Admin', roles: ['admin'] });
  console.log('Admin user created: admin@kioscart.com / admin123');
  process.exit(0);
}

seed().catch(err => { console.error(err); process.exit(1); });
