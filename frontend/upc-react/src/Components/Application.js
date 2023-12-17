import React, { useContext, useState, useEffect } from 'react';
import './Application.css';
import { checkConnection, getFiles, getResults, getImages, process } from '../Tools/api.js';
import { ParaContext } from '../Global.js';
import FileList from './FileList.js';
import ResultList from './ResultList.js';
import UploadForm from './UploadForm.js';
import ImagesList from './ImagesList.js';
import Heading from './Heading.js';
import Logo from './Logo.js';
import Term from './Term.js';
import particlesJS from 'particles.js';
import Processing from './processing.js';

const ApplicationForm = () => {
    const [connected, setConnected] = useState(false);
    const [files, setFiles] = useState([]);
    const [results, setResults] = useState([]);
    const [images, setImages] = useState([]);
    const [selectedImages, setSelectedImages] = useState(""); // Store the selected files
    const [selectedFiles, setSelectedFiles] = useState([]); // Store the selected files
    const [selectedResults, setSelectedResults] = useState([]); // Store the selected files
    const [termShown, setTermShown] = useState(false); // Store the selected files
    const [processing, setProcessing] = useState(false); // Store the selected files
    const { API_URL } = useContext(ParaContext);

    // Check if the backend is connected
    const checkBackend = async() => {
        const connectSitu = await checkConnection(API_URL);
        setConnected(connectSitu);
    };

    const handleProcessClick = () => {
        setProcessing(!processing);
        // process(API_URL, selectedImages, selectedFiles);
    };

    const toggleTerm = () => {
        setTermShown(!termShown);
        window.scrollTo({
            top: 0,
            right: 0,
            behavior: 'smooth'
        });
    };

    const refreshFiles = () => {
        getFiles(API_URL)
        .then(files => {
            setFiles(files);
        })
        .catch(error => {
            console.error('Error fetching files:', error);
        });
    };

    const refreshResults = () => {
        getResults(API_URL)
        .then(results => {
            setResults(results);
        })
        .catch(error => {
            console.error('Error fetching results:', error);
        });
    };

    const refreshImages = () => {
        getImages(API_URL)
        .then(images => {
            setImages(images);
        })
        .catch(error => {
            console.error('Error fetching images:', error);
        });
    }

    const refresh = () => {
        refreshFiles();
        refreshResults();
        refreshImages();
        console.log("Resfreshed files, images and results");
    };

    useEffect(() => {
        // Get the list of files when the component mounts
        checkBackend();
        if (connected) {
            refreshFiles();
            refreshResults();
            refreshImages();
        }
        if (window.particlesJS) {
            window.particlesJS.load('particles-js', 'particlesjs.json', function() {
              console.log('particles.js loaded - callback');
            });
        }
        
        // Remove the canvas element when the component unmounts
        return () => {
            let particlesJSContainer = document.getElementById('particles-js');
            if (particlesJSContainer) {
                // Remove the canvas element
                while (particlesJSContainer.firstChild) {
                    particlesJSContainer.removeChild(particlesJSContainer.firstChild);
                }
            }
        };
    }, [API_URL]);

    return (
        <div>
            <div id="particles-js" className="particles-container"></div>
            <Heading toggleTerm={toggleTerm} />
            <div className='term-and-logo'>
                <Logo termShown={termShown} connected={connected}/>     
                <div className={`term ${termShown? 'active' : ''}`}>
                    {termShown? <Term/> : null}
                    {/* <Term/> */}
                </div>
            </div>
            <button className={`command-button ${selectedImages  ? 'shining' : '' }` } onClick={handleProcessClick} >Process</button>
            {processing ? <Processing /> : null}
            <div className="area">
                <UploadForm refreshFiles={refreshFiles} refreshResults={refreshResults} refreshAll={refresh}/>
                
                <ImagesList images={images} selectedImages={selectedImages} setSelectedImages={setSelectedImages} refreshImages={refreshImages} refreshAll={refresh}/>
            </div>
            <div className='area'>
                <FileList files={files} selectedFiles={selectedFiles} setSelectedFiles={setSelectedFiles} refreshFiles={refreshFiles} refreshResults={refreshResults} refreshAll={refresh}/>
                
                <ResultList results={results} selectedResults={selectedResults} setSelectedResults={setSelectedResults} refreshFiles={refreshFiles} refreshResults={refreshResults} refreshAll={refresh}/>
            </div>
        </div>
    );
}

export default ApplicationForm;
