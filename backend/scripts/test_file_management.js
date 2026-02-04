
import fileManagementService from '../src/services/fileManagementService.js';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const UPLOADS_ROOT = path.resolve(__dirname, '../uploads');

async function runTest() {
    console.log('Starting File Management Service Test...');

    const testFolder = 'test_ai_folder_' + Date.now();
    const testFileName = 'test_file.txt';
    const testFileContent = 'Hello AI World';

    try {
        // 1. Create a dummy file in root uploads
        console.log(`\n[1] Creating dummy file at root: ${testFileName}`);
        await fs.mkdir(UPLOADS_ROOT, { recursive: true });
        await fs.writeFile(path.join(UPLOADS_ROOT, testFileName), testFileContent);
        console.log('✅ File created.');

        // 2. Create a new folder
        console.log(`\n[2] Creating folder: ${testFolder}`);
        const createResult = await fileManagementService.createFolder(testFolder);
        console.log('Result:', createResult);
        if (!createResult.success) throw new Error('Create folder failed');
        console.log('✅ Folder creation successful.');

        // 3. Move file to folder
        console.log(`\n[3] Moving file to folder...`);
        const moveResult = await fileManagementService.moveFile(testFileName, testFolder);
        console.log('Result:', moveResult);
        if (!moveResult.success) throw new Error('Move file failed');
        console.log('✅ Move successful.');

        // 4. List files in the new folder
        console.log(`\n[4] Listing files in ${testFolder}...`);
        const files = await fileManagementService.listFiles(testFolder);
        console.log('Files found:', files);

        if (files.length === 1 && files[0].name === testFileName) {
            console.log('✅ Verified file is in the folder.');
        } else {
            throw new Error('File verification failed');
        }

        // 5. Clean up
        console.log(`\n[5] Cleaning up...`);
        await fs.rm(path.join(UPLOADS_ROOT, testFolder), { recursive: true, force: true });
        console.log('✅ Cleanup done.');

        console.log('\n🎉 ALL TESTS PASSED!');

    } catch (error) {
        console.error('\n❌ TEST FAILED:', error);
        process.exit(1);
    }
}

runTest();
