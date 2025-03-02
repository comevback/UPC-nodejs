import { useState, useEffect, useContext, useRef } from 'react';
import { downloadFile, generateImage, deleteFile, downloadAllFiles, downloadAllFilesZip, deleteAllFiles, processFile } from '../Tools/api';
import { ParaContext } from '../Global.js';  
import Swal from 'sweetalert2'; 
import './FileList.css';

// FileList.js
const FileList = (props) => {
    const [info, setInfo] = useState([]); // 信息
    const [activeInfoFile, setActiveInfoFile] = useState(''); // 被选中的文件
    const [isLoading, setIsLoading] = useState(false); // 是否正在加载
    const socket = useRef(null);
    const { API_URL } = useContext(ParaContext);


    // If click the checkbox, add the file to the selectedFiles
    const handleCheckboxChange = (fileName) => {
        const updatedSelectedFiles = props.selectedFiles.includes(fileName) 
            ? props.selectedFiles.filter(file => file !== fileName)
            : [...props.selectedFiles, fileName];
        
        console.log('Updated selected files:', updatedSelectedFiles);
        props.setSelectedFiles(updatedSelectedFiles);
    };
    
    // select all files
    const handleSelectAllClick = () => {
        if (props.selectedFiles.length === props.files.length) {
            props.setSelectedFiles([]);
        } else {
            props.setSelectedFiles(props.files);
        }
    };

    // Download all files separately
    const handleDownloadAllClick = () => {
        downloadAllFiles(API_URL, props.selectedFiles);
    };

    // Download all files together
    const handleDownloadTogetherClick = () => {
        downloadAllFilesZip(API_URL, props.selectedFiles);
    };

    // Delete all selected files
    const handleDeleteAllClick = async () => {
        await deleteAllFiles(API_URL, props.selectedFiles);
        props.refreshFiles();
    };

    // process the file with OpenAI
    const handleProcessClick = async (file) => {
        await processFile(API_URL, file);
        props.refreshFiles();
    };

    // If click the file, Show the info, and generate the image, refresh the file list
    const handleFileClick = async(file) => {
        setInfo('Loading...');
        setActiveInfoFile(file);
        setIsLoading(true);

        try {
            const response = await generateImage(API_URL, file);
            if (response === undefined || response.length === 0 || response === false) {
                setInfo('Invalid file type, Shoud be .zip file');
            } else {
                setInfo('Image generated successfully.');
                Swal.fire({
                    title: `Generate Successfully`,
                    customClass: {
                        popup: 'formatted-alert'
                    },
                    width: '600px',
                    confirmButtonText: 'Close'
                });
            }
            props.refreshAll();
            setActiveInfoFile('');
        }finally {
            setIsLoading(false);
        }
    };

    // ============================== WebSocket ==================================
    useEffect(() => {
        props.refreshFiles();

        // Create a new WebSocket
        socket.current = new WebSocket(`ws://localhost:4000/ws`);

        // Handle WebSocket events
        socket.current.onopen = () => {
            console.log('WebSocket connection opened');
        };

        socket.current.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'geneMessage') {
                    setInfo(message.message);
                } else if (message.type === 'geneError') {
                    setInfo(message.message);
                } else if (message.type === 'output') {
                    setInfo(message.data);
                }
            } catch (e) {
                console.error('Invalid message received:', event.data);
            }
        };

        socket.current.onclose = () => {
            console.log('WebSocket connection closed');
        };

        socket.current.onerror = (error) => {
            console.error('WebSocket error:', error);
        };


        // Close the WebSocket connection when the component unmounts
        return () => {
            if (socket.current) {
                socket.current.close();
            }
            setInfo([]);
        };
    }, [API_URL]);

    // =============================== WebSocket ==================================

    if (!props.files.length){
        return (
            <div>
                <h1>Uploaded</h1>
                <ul className="file-list">
                <li className='file-item example'>
                    <div className='name-and-buttons'>
                        <input type='checkbox' className='checkbox' />
                        <span>File Name</span>
                        <div className='buttons'>
                            <button onClick={() => {handleDownloadAllClick()}}>&#x21E9; Separately</button>
                            <button onClick={() => {handleDownloadTogetherClick()}}>&#x21E9; Bundle</button>
                            <button onClick={() => {handleDeleteAllClick()}} >&#10007;</button>
                        </div>
                    </div>
                </li>
                </ul>
            </div>
        );
    };

    return (
        <div>
            <h1>Uploaded</h1>
            <ul className="file-list">
                <li className='file-item example'>
                    <div className='name-and-buttons'>
                        <input type='checkbox' className='checkbox' checked={props.selectedFiles.length === props.files.length}
                            onChange={handleSelectAllClick} />
                        <span>File Name</span>
                        <div className='buttons'>
                            <button onClick={() => {handleDownloadAllClick()}}>&#x21E9; Separately</button>
                            <button onClick={() => {handleDownloadTogetherClick()}}>&#x21E9; Bundle</button>
                            <button onClick={() => {handleDeleteAllClick()}} >&#10007;</button>
                        </div>
                    </div>
                </li>
                {props.files.map(file => (
                    <li className={`file-item ${props.selectedFiles.includes(file) ? 'selected' : activeInfoFile.includes(file) ? 'actived' : ''}`} key={file}>
                        <div className='name-and-buttons'>
                            <input type='checkbox' className='checkbox' checked={props.selectedFiles.includes(file)}
                                onChange={() => handleCheckboxChange(file)} />
                            <span>{file}</span>
                            <div className='buttons'>
                                {/* <button onClick={() => handleProcessClick(file)} >AI generate</button> */}
                                <button className='geneButton' onClick={() => handleFileClick(file)} >{activeInfoFile === file && isLoading ? <div className="spinner"></div> : 'Generate Image'}</button>
                                <button onClick={() => downloadFile(API_URL, file)}>&#x21E9;</button>
                                <button onClick={async() => {
                                    await deleteFile(API_URL, file);
                                    props.refreshFiles();
                                }}>&#10007;</button>
                            </div>
                        </div>
                        {activeInfoFile === file && (
                            <div className='info'>
                                <p className={
                                    info === 'Invalid file type, Shoud be .zip file'
                                    ? 'info-error'
                                    : info === 'Loading...'
                                    ? 'info-loading'
                                    : ''
                                }>
                                {info || 'Loading...'}
                                </p>
                            </div>
                        )}
                    </li>
                ))}
            </ul>
        </div>       
    );
}

export default FileList;