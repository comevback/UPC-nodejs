//import and setting
import express from "express";
import bodyParser from "body-parser";
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import pty from 'node-pty';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import { exec, spawn } from "child_process";
import http from "http";
import { WebSocketServer, WebSocket } from 'ws';
import { serviceInfo, upload, limiter, registerService, unregisterService, sendHeartbeat, getWorkingDir, getEntrypoint, getCmd, getAvailableShell } from "./Components/methods.js";

const app = express();
app.set('trust proxy', true); // trust first proxy
// https certificate and key
// const privateKeyPath = path.join('/etc/letsencrypt/live/xuxiang.art', 'privkey.pem');
// const certificatePath = path.join('/etc/letsencrypt/live/xuxiang.art', 'fullchain.pem');

// const privateKey = fs.readFileSync(privateKeyPath, 'utf8');
// const certificate = fs.readFileSync(certificatePath, 'utf8');

// const server = https.createServer({ key: privateKey, cert: certificate }, app);
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
const port = process.env.API_PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.set('view engine', 'ejs');
app.use(express.json()); // for parsing application/json
app.use(cors());
//app.use(limiter);

// ********************************************  Register Or Heartbeat  ********************************************

let isRegistered = false;

const Register = async () => {
    const response = await registerService();
    if (response) {
        isRegistered = true;
        console.log('Service registered');
    } else {
        isRegistered = false;
        console.log('Failed to register service, isRegisterd: ' + isRegistered);
    }
};

const Heartbeat = async () => {
    const response = await sendHeartbeat();
    if (response) {
        console.log('Heartbeat sent: ————' + new Date(Date.now()).toLocaleString());
    } else {
        isRegistered = false;
    }
}

Register();

// Send a heartbeat or register the service every 60 seconds
setInterval(() => {
    if (!isRegistered) {
        Register();
    } else {
        Heartbeat();
    };
}, 60000);


// Gracefully unregister the service when the process is terminated ============================================
const gracefulShutdown = () => {
    try {
        unregisterService();
        console.log('Service unregistered and server is closing.');
        setTimeout(() => {
            process.exit(0);
        }, 1000); // Wait 3 seconds before shutting down
    } catch (error) {
        console.log('Failed to unregister service: ', error.message);
    }
};

// Handle process termination
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ********************************************  Routers  ********************************************

// basic
app.get("/", (req, res) => {
    res.render("index");
});

// Connection test
app.get('/api', (req, res) => {
    res.send("Connected to API server");
});

// Route to upload files to the server
app.post('/api/upload', upload.array('file', 50), (req, res) => {
    console.log(req.files);
    res.send(req.files);
});

// Route to get the list of all files
app.get('/api/files', async (req, res) => {
    const directoryPath = path.join(__dirname, 'uploads');
    // if the uploads folder does not exist, create it
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath);
    }
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).send('Unable to scan directory: ' + err);
        }
        // ignore the .gitkeep and __MACOSX and .DS_Store file
        files = files.filter(file => file !== '.gitkeep' && file !== '__MACOSX' && file !== '.DS_Store');
        // Return the list of files
        res.send(files);
    });
});

// Route to get the list of all results
app.get('/api/results', async (req, res) => {
    const directoryPath = path.join(__dirname, 'results');
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath);
    }
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).send('Unable to scan directory: ' + err);
        }
        // ignore the .gitkeep file
        files = files.filter(file => file !== '.gitkeep' && file !== '__MACOSX' && file !== '.DS_Store');
        // Return the list of files
        res.send(files);
    });
});

// Route to get the list of all temp
app.get('/api/temps', async (req, res) => {
    const directoryPath = path.join(__dirname, 'temps');
    if (!fs.existsSync(directoryPath)) {
        fs.mkdirSync(directoryPath);
    }
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).send('Unable to scan directory: ' + err);
        }
        // ignore the .gitkeep file
        files = files.filter(file => file !== '.gitkeep' && file !== '__MACOSX' && file !== '.DS_Store');
        // Return the list of files
        res.send(files);
    });
});


// Route to download a file
app.get('/api/files/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    res.download(filePath);
});

// Route to download all selected files
app.post('/api/files/download', async (req, res) => {
    const { fileNames } = req.body;
    const filePath = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(filePath);
    const matchedFiles = files.filter(file => fileNames.includes(file));

    if (matchedFiles.length === 0) {
        return res.status(404).send('No files found');
    }

    console.log('Files to download:', matchedFiles);

    const zipFileName = 'Result-' + Date.now() + '.zip'; // Name of the ZIP file to download
    const zipFilePath = path.join(filePath, zipFileName);

    const zip = spawn('zip', ['-r', zipFileName, ...matchedFiles], { cwd: filePath });

    zip.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    zip.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    zip.on('close', (code) => {
        if (code !== 0) {
            console.error(`zip process exited with code ${code}`);
            return res.status(500).send({ message: 'Error zipping files' });
        }
        console.log('Files zipped successfully');
        broadcast('geneMessage', 'Files zipped successfully');

        // Now that ZIP process has completed, send the file
        res.download(zipFilePath, (err) => {
            if (err) {
                // Handle error, but don't re-throw if headers are already sent
                console.error('Error sending file:', err);
            }

            // Attempt to delete the file after sending it to the client
            fs.unlink(zipFilePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Error deleting file ${zipFilePath}:`, unlinkErr);
                } else {
                    console.log(`Successfully deleted ${zipFilePath}`);
                }
            });
        });
    });
});

// Route to download a result
app.get('/api/results/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'results', req.params.filename);
    res.download(filePath);
});

// Route to download all selected results
app.post('/api/results/download', async (req, res) => {
    const { fileNames } = req.body;
    const filePath = path.join(__dirname, 'results');
    const files = fs.readdirSync(filePath);
    const matchedFiles = files.filter(file => fileNames.includes(file));

    if (matchedFiles.length === 0) {
        return res.status(404).send('No files found');
    }

    console.log('Files to download:', matchedFiles);

    const zipFileName = 'Result-' + Date.now() + '.zip'; // Name of the ZIP file to download
    const zipFilePath = path.join(filePath, zipFileName);

    const zip = spawn('zip', ['-r', zipFileName, ...matchedFiles], { cwd: filePath });

    zip.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    zip.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    zip.on('close', (code) => {
        if (code !== 0) {
            console.error(`zip process exited with code ${code}`);
            return res.status(500).send({ message: 'Error zipping files' });
        }
        console.log('Files zipped successfully');
        broadcast('geneMessage', 'Files zipped successfully');

        // Now that ZIP process has completed, send the file
        res.download(zipFilePath, (err) => {
            if (err) {
                // Handle error, but don't re-throw if headers are already sent
                console.error('Error sending file:', err);
            }

            // Attempt to delete the file after sending it to the client
            fs.unlink(zipFilePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Error deleting file ${zipFilePath}:`, unlinkErr);
                } else {
                    console.log(`Successfully deleted ${zipFilePath}`);
                }
            });
        });
    });
});

// Route to download a temp
app.get('/api/temps/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'temps', req.params.filename);
    res.download(filePath);
});

// Route to download all selected temps
app.post('/api/temps/download', async (req, res) => {
    const { fileNames } = req.body;
    const filePath = path.join(__dirname, 'temps');
    const files = fs.readdirSync(filePath);
    const matchedFiles = files.filter(file => fileNames.includes(file));

    if (matchedFiles.length === 0) {
        return res.status(404).send('No files found');
    }

    console.log('Files to download:', matchedFiles);

    const zipFileName = 'Result-' + Date.now() + '.zip'; // Name of the ZIP file to download
    const zipFilePath = path.join(filePath, zipFileName);

    const zip = spawn('zip', ['-r', zipFileName, ...matchedFiles], { cwd: filePath });

    zip.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    zip.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    zip.on('close', (code) => {
        if (code !== 0) {
            console.error(`zip process exited with code ${code}`);
            return res.status(500).send({ message: 'Error zipping files' });
        }
        console.log('Files zipped successfully');
        broadcast('geneMessage', 'Files zipped successfully');

        // Now that ZIP process has completed, send the file
        res.download(zipFilePath, (err) => {
            if (err) {
                // Handle error, but don't re-throw if headers are already sent
                console.error('Error sending file:', err);
            }

            // Attempt to delete the file after sending it to the client
            fs.unlink(zipFilePath, (unlinkErr) => {
                if (unlinkErr) {
                    console.error(`Error deleting file ${zipFilePath}:`, unlinkErr);
                } else {
                    console.log(`Successfully deleted ${zipFilePath}`);
                }
            });
        });
    });
});


// **********************************************************  Docker  ******************************************************
// Route to get the list of all images
app.get('/api/images', (req, res) => {
    exec('docker images --format "{{.Repository}}:{{.Tag}}" | sort', (err, stdout, stderr) => {
        if (err) {
            // Error handling
            res.status(500).send(stderr);
        } else {
            // Standard output handling
            const images = stdout.split('\n').filter(line => line); // Delete the last empty line
            res.status(200).json(images);
        }
    });
});

//view the image details
app.get('/api/images/:imageName', async (req, res) => {
    const { imageName } = req.params;

    exec(`docker inspect ${imageName}`, (err, stdout, stderr) => {
        if (err) {
            // Error handling
            console.error(`Error inspecting image: ${err}`);
            res.status(500).send(stderr);
        } else {
            try {
                // Try to parse the JSON output
                const imageDetails = JSON.parse(stdout);
                // Create a new array with the formatted details
                const formattedDetails = imageDetails.map(detail => ({
                    WorkingDir: detail.Config.WorkingDir,
                    Entrypoint: detail.Config.Entrypoint,
                    Cmd: detail.Config.Cmd,
                    Id: detail.Id,
                    Created: detail.Created,
                    Size: `${(detail.Size / 1024 / 1024).toFixed(2)} MB`,
                    Architecture: detail.Architecture,
                    RepositoryTags: detail.RepoTags,
                    Os: detail.Os,
                    DockerVersn: detail.DockerVersion,
                    // more details can be added here
                }));

                // Send the formatted details to the client
                res.status(200).json(formattedDetails);

            } catch (parseErr) {
                // If the JSON parsing fails, send an error to the client
                console.error(`Error parsing JSON: ${parseErr}`);
                res.status(500).send('Error parsing JSON');
            }
        }
    });
});

// unzip the file and build the image with the extracted files by buildpack
app.post('/api/files/:filename', async (req, res) => {
    const startTime = Date.now();
    const { filename } = req.params;
    const baseFileName = path.basename(filename, '.zip');
    const filePath = path.join(__dirname, 'uploads', filename);
    const extractPath = path.join(__dirname, 'uploads');
    const appPath = path.join(__dirname, 'uploads', baseFileName);

    console.log(`Attempting to unzip file: ${filePath}`);

    if (!filename.endsWith('.zip')) {
        console.log('Invalid file type');
        broadcast('geneError', 'Invalid file type, Should be .zip file');
        return res.status(400).send({ message: 'Invalid file type, Should be .zip file' });
    }

    if (!fs.existsSync(filePath)) {
        console.log('File does not exist');
        return res.status(400).send({ message: 'File does not exist' });
    }

    if (fs.existsSync(appPath)) {
        await fs.promises.rm(appPath, { recursive: true });
        console.log('Previous unzipped folder deleted');
    }

    const unzip = spawn('unzip', ['-o', filePath, '-d', extractPath]);

    unzip.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        broadcast('geneMessage', data.toString());
    });

    unzip.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        broadcast('geneError', data.toString());
    });

    unzip.on('close', (code) => {
        if (code !== 0) {
            console.error(`unzip process exited with code ${code}`);
            return res.status(500).send({ message: 'Error unzipping file' });
        }

        console.log('File unzipped successfully');
        broadcast('geneMessage', 'File unzipped successfully');

        const pack = spawn('pack', [
            'build',
            baseFileName.toLowerCase(),
            '--path', appPath,
            '--builder', 'paketobuildpacks/builder-jammy-base'
        ]);

        pack.stdout.on('data', (data) => {
            console.log(`stdout: ${data}`);
            broadcast('geneMessage', data.toString());
        });

        pack.stderr.on('data', (data) => {
            console.error(`stderr: ${data}`);
            broadcast('geneError', data.toString());
        });

        pack.on('close', async (code) => {
            const endTime = Date.now();
            const timeTaken = (endTime - startTime) / 1000;
            console.log(`Time took: ${timeTaken}s`);

            if (code === 0) {
                console.log(`pack build completed successfully.`);
                await fs.promises.rm(appPath, { recursive: true });
                console.log('unzipped folder deleted');
                broadcast('geneMessage', `[${timeTaken}s] Image built successfully.`);
                res.status(200).send({ message: 'Image built successfully' });
            } else {
                console.error(`pack build failed with code ${code}`);
                broadcast('geneError', `[${timeTaken}s] Error building image.`);
                res.status(500).send({ message: 'Error building image' });
            }
        });
    });
});

// **********************************************************  Delete  ******************************************************
// Route to delete a file
app.delete('/api/files/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'uploads', req.params.filename);
    fs.lstat(filePath, (err, stats) => {
        if (err) {
            // if file does not exist or path is invalid, handle the error
            return res.status(500).send('Error when visiting the file path: ' + err.message);
        }

        if (stats.isDirectory()) {
            // if it is a directory, delete it recursively
            fs.rm(filePath, { recursive: true }, (err) => {
                if (err) {
                    return res.status(500).send('Can not find the file' + err.message);
                }
                res.send('directory deleted successfully');
            });
        } else {
            // if it is not a directory, try to delete the file
            fs.unlink(filePath, (err) => {
                if (err) {
                    // if file can not be deleted, handle the error
                    return res.status(500).send('Unable to delete the file: ' + err.message);
                }
                // send success response after deleting the file
                console.log(`File: ${filePath} deleted successfully`)
                res.send('File deleted successfully');
            });
        }
    });
});

// Route to delete a result
app.delete('/api/results/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'results', req.params.filename);
    fs.lstat(filePath, (err, stats) => {
        if (err) {
            // if file does not exist or path is invalid, handle the error
            return res.status(500).send('Error when visiting the file path: ' + err.message);
        }

        if (stats.isDirectory()) {
            // if it is a directory, delete it recursively
            fs.rm(filePath, { recursive: true }, (err) => {
                if (err) {
                    return res.status(500).send('Can not find the file' + err.message);
                }
                res.send('directory deleted successfully');
            });
        } else {
            // if it is not a directory, try to delete the file
            fs.unlink(filePath, (err) => {
                if (err) {
                    // if file can not be deleted, handle the error
                    return res.status(500).send('Unable to delete the file: ' + err.message);
                }
                // send success response after deleting the file
                console.log(`File: ${filePath} deleted successfully`)
                res.send('File deleted successfully');
            });
        }
    });
});

// Delete all selected files
app.delete('/api/files', async (req, res) => {
    const { fileNames } = req.body.files;
    const filePath = path.join(__dirname, 'uploads');
    const files = fs.readdirSync(filePath);
    const matchedFiles = files.filter(file => fileNames.includes(file));

    if (matchedFiles.length === 0) {
        return res.status(404).send('No files found');
    }

    console.log('Files to delete:', matchedFiles);

    matchedFiles.forEach(file => {
        fs.unlinkSync(path.join(filePath, file));
    });

    console.log(`File: ${matchedFiles} deleted successfully`)
    res.status(200).send({ message: 'Files deleted successfully' });
});


// Delete all selected results
app.delete('/api/results', async (req, res) => {
    const { fileNames } = req.body.files;
    const filePath = path.join(__dirname, 'results');
    const files = fs.readdirSync(filePath);
    const matchedFiles = files.filter(file => fileNames.includes(file));

    if (matchedFiles.length === 0) {
        return res.status(404).send('No files found');
    }

    console.log('Files to delete:', matchedFiles);

    matchedFiles.forEach(file => {
        fs.unlinkSync(path.join(filePath, file));
    });

    console.log(`File: ${matchedFiles} deleted successfully`)
    res.status(200).send({ message: 'Files deleted successfully' });
});


// Route to delete a temp
app.delete('/api/temps/:filename', (req, res) => {
    const filePath = path.join(__dirname, 'temps', req.params.filename);
    fs.lstat(filePath, (err, stats) => {
        if (err) {
            // if file does not exist or path is invalid, handle the error
            return res.status(500).send('Error when visiting the file path: ' + err.message);
        }

        if (stats.isDirectory()) {
            // if it is a directory, delete it recursively
            fs.rm(filePath, { recursive: true }, (err) => {
                if (err) {
                    return res.status(500).send('Can not find the file' + err.message);
                }
                res.send('directory deleted successfully');
            });
        } else {
            // if it is not a directory, try to delete the file
            fs.unlink(filePath, (err) => {
                if (err) {
                    // if file can not be deleted, handle the error
                    return res.status(500).send('Unable to delete the file: ' + err.message);
                }
                // send success response after deleting the file
                console.log(`File: ${filePath} deleted successfully`)
                res.send('File deleted successfully');
            });
        }
    });
});

// Route to delete an image
app.delete('/api/images/:imageName', (req, res) => {
    const { imageName } = req.params;
    exec(`docker rmi ${imageName}`, (err, stdout, stderr) => {
        if (err) {
            // Error handling
            console.error(`Error deleting image: ${err}`);
            res.status(500).send(stderr);
        } else {
            // Standard output handling
            console.log(`Image deleted: ${stdout}`);
            res.status(200).send(stdout);
        }
    });
});

// Route to execute a command and use ws to send the output to the client
app.post('/api/command', (req, res) => {
    console.log(req.body);
    const { command } = req.body; // Get the command from the request body
    console.log(`Executing command: ${command}`);

    const child = exec(command, { shell: true });

    // Send the output to all connected WebSocket clients
    child.stdout.on('data', (data) => {
        console.log(`stdout: ${data}`);
        broadcast('geneMessage', data.toString());
    });
    // Send the Error to all connected WebSocket clients
    child.stderr.on('data', (data) => {
        console.error(`stderr: ${data}`);
        broadcast('geneMessage', data.toString());
    });
    // Send the output to all connected WebSocket clients
    child.on('close', (code) => {
        console.log(`child process exited with code ${code}`);
        broadcast('geneMessage', `child process exited with code ${code}`);
    });
});

// upload this file to openai and get the result
app.post('/api/openai/:fileName', async (req, res) => {
    const { fileName } = req.params;
    console.log("process this file with OpenAI: " + fileName);
    const filePath = path.join(__dirname, 'uploads', fileName);
    const result = await AI_input(filePath);
    const { thread_id, run_id } = result;
    console.log(result);
    res.send(result);
});


// ********************************************  Start and WS  ********************************************
//Listen on port
server.listen(port, () => {
    console.log(`Server is running on port ${port}.`);
});

// Broadcast function for WebSocket
const broadcast = (type, message) => {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify({ type, message }));
        }
    });
};

// Listen for new connections
wss.on('connection', (ws) => {
    console.log('New WebSocket connection');

    // Send the service info to the client
    ws.send(JSON.stringify({ type: 'message', data: serviceInfo }));

    const available_shell = getAvailableShell();

    const shellTTY = pty.spawn(available_shell, [], {
        name: 'xterm-256color',
        cols: 130,
        rows: 40,
        cwd: process.env.WorkingDir || process.cwd(),
        env: process.env
    });

    shellTTY.on('data', (data) => {
        ws.send(JSON.stringify({ type: 'output', data })); // 发送给前端
    });

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);
        if (parsedMessage.type === 'input') {
            shellTTY.write(parsedMessage.data); // 接收前端输入
        }
    });

    ws.on('close', () => {
        shellTTY.kill();
        console.log('User disconnected');
    });
});