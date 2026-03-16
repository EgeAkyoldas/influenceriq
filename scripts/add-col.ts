import { resolve } from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: resolve('.env.local') });

import { execute } from '../src/lib/db';

async function addDynamicTagsColumn() {
  console.log('🔄 Adding dynamic_tags column to analysis_results...');
  try {
    await execute('ALTER TABLE analysis_results ADD COLUMN dynamic_tags TEXT DEFAULT "[]";');
    console.log('✅ Column added successfully to analysis_results.');
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message && err.message.includes('duplicate column name')) {
      console.log('✅ Column already exists in analysis_results.');
    } else {
      console.error('❌ Error adding column:', err.message);
    }
  }

  try {
    await execute('ALTER TABLE analysis_snapshots ADD COLUMN dynamic_tags TEXT DEFAULT "[]";');
    console.log('✅ Column added successfully to analysis_snapshots.');
  } catch (error: unknown) {
    const err = error as Error;
    if (err.message && err.message.includes('duplicate column name')) {
      console.log('✅ Column already exists in analysis_snapshots.');
    } else {
      console.error('❌ Error adding column:', err.message);
    }
  }
}

addDynamicTagsColumn().catch(console.error);
