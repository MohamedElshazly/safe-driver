import React, { useState, useEffect } from 'react';

//react native
import { ActivityIndicator, Text, View, ScrollView, StyleSheet, Button, Platform } from 'react-native';


//Expo
import Constants from 'expo-constants';
import * as Permissions from 'expo-permissions';
import { Camera } from 'expo-camera';

//Tensorflow
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import {cameraWithTensors} from '@tensorflow/tfjs-react-native';

//disable yellow warnings on EXPO client!
console.disableYellowBox = true;

export default function App() {

  //------------------------------------------------
  //state variables for image/translation processing
  //------------------------------------------------
  
  const [predictionFound, setPredictionFound] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);

  const [prediction, setPrediction] = useState('')

  //Tensorflow and Permissions
  const [mobilenetModel, setMobilenetModel] = useState(null);
  const [frameworkReady, setFrameworkReady] = useState(false);


  //TF Camera Decorator
  const TensorCamera = cameraWithTensors(Camera);

  //RAF ID
  let requestAnimationFrameId = 0;

  //performance hacks (Platform dependent)
  const textureDims = Platform.OS === "ios"? { width: 1080, height: 1920 } : { width: 1600, height: 1200 };
  const tensorDims = { width: 152, height: 200 }; 

  //-----------------------------
  // Run effect once
  // 1. Check camera permissions
  // 2. Initialize TensorFlow
  // 3. Load Mobilenet Model
  //-----------------------------
  useEffect(() => {
    if(!frameworkReady) {
      (async () => {

        //check permissions
        const { status } = await Camera.requestPermissionsAsync();
        console.log(`permissions status: ${status}`);
        setHasPermission(status === 'granted');

        //we must always wait for the Tensorflow API to be ready before any TF operation...
        await tf.ready();

        //load the mobilenet model and save it in state
        setMobilenetModel(await loadMobileNetModel());

        setFrameworkReady(true);
      })();
    }
  }, []);

  //--------------------------
  // Run onUnmount routine
  // for cancelling animation 
  // if running to avoid leaks
  //--------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(requestAnimationFrameId);
    };
  }, [requestAnimationFrameId]);

  

  //-----------------------------------------------------------------
  // Loads the mobilenet Tensorflow model: 
  // https://github.com/tensorflow/tfjs-models/tree/master/mobilenet
  // Parameters:
  // 
  // NOTE: Here, I suggest you play with the version and alpha params
  // as they control performance and accuracy for your app. For instance,
  // a lower alpha increases performance but decreases accuracy. More
  // information on this topic can be found in the link above.  In this
  // tutorial, I am going with the defaults: v1 and alpha 1.0
  //-----------------------------------------------------------------
  const loadMobileNetModel = async () => {
    const model = await mobilenet.load();
    return model;
  }


  //----------------------------------------------------------------------------------------
  // MobileNet tensorflow model classify operation returns an array of prediction objects 
  // with this structure: prediction = [ {"className": "object name", "probability": 0-1 } ]
  // where:
  // className = The class of the object being identified. Currently, this model identifies 1000 different classes.
  // probability = Number between 0 and 1 that represents the prediction's probability 
  // Example (with a topk parameter set to 3 => default):
  // [
  //   {"className":"joystick","probability":0.8070220947265625},
  //   {"className":"screen, CRT screen","probability":0.06108357384800911},
  //   {"className":"monitor","probability":0.04016926884651184}
  // ]
  // In this case, we use topk set to 1 as we are interested in the higest result for
  // both performance and simplicity. This means the array will return 1 prediction only!
  //----------------------------------------------------------------------------------------
  const getPrediction = async(tensor) => {
    if(!tensor) { return; }

    //topk set to 1
    const prediction = await mobilenetModel.classify(tensor, 1);
    console.log(`prediction: ${JSON.stringify(prediction)}`);

    if(!prediction || prediction.length === 0) { return; }
    
    //only attempt translation when confidence is higher than 20%
    if(prediction[0].probability > 0.3) {

      //stop looping!
      cancelAnimationFrame(requestAnimationFrameId);
      setPredictionFound(true);
      setPrediction(prediction[0].className)

      //get translation!
    }
  }

  //------------------------------------------------------------------------------
  // Helper function to handle the camera tensor streams. Here, to keep up reading
  // input streams, we use requestAnimationFrame JS method to keep looping for 
  // getting better predictions (until we get one with enough confidence level).
  // More info on RAF:
  // https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
  //------------------------------------------------------------------------------
  const handleCameraStream = (imageAsTensors) => {
    const loop = async () => {
      const nextImageTensor = await imageAsTensors.next().value;
      await getPrediction(nextImageTensor);
      requestAnimationFrameId = requestAnimationFrame(loop);
    };
    if(!predictionFound) loop();
  }

  //------------------------------------------------------
  // Helper function to reset all required state variables 
  // to start a fresh new translation routine! 
  //------------------------------------------------------
  const loadNewPrediction = () => {
    setPrediction('');
    setPredictionFound(false);
  }

  const showPredictionView = () => { 
    return  <View style={styles.translationView}>
              {
                predictionFound ?
                  <View>
                    <ScrollView style={{height:400}}>
                      <Text style={styles.wordTextField}>{prediction}</Text>
                    </ScrollView>
                    <Button color='#9400D3' title="Check new prediction" onPress={() => loadNewPrediction()}/>
                  </View>
                : <ActivityIndicator size="large"/>
              }
            </View>
  }

  //--------------------------------------------------------------------------------
  // Helper function to show the Camera View. 
  //
  // NOTE: Please note we are using TensorCamera component which is constructed 
  // on line: 37 of this function component. This is just a decorated expo.Camera 
  // component with extra functionality to stream Tensors, define texture dimensions
  // and other goods. For further research:
  // https://js.tensorflow.org/api_react_native/0.2.1/#cameraWithTensors
  //--------------------------------------------------------------------------------
  const renderCameraView = () => {
    return <View style={styles.cameraView}>
                <TensorCamera
                  style={styles.camera}
                  type={Camera.Constants.Type.back}
                  zoom={0}
                  cameraTextureHeight={textureDims.height}
                  cameraTextureWidth={textureDims.width}
                  resizeHeight={tensorDims.height}
                  resizeWidth={tensorDims.width}
                  resizeDepth={3}
                  onReady={(imageAsTensors) => handleCameraStream(imageAsTensors)}
                  autorender={true}
                />
            </View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          My Pictionary
        </Text>
      </View>

      <View style={styles.body}>
        {predictionFound ? showPredictionView() : renderCameraView() }
      </View>  
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: Constants.statusBarHeight,
    backgroundColor: '#E8E8E8',
  },
  header: {
    backgroundColor: '#41005d'
  },
  title: {
    margin: 10,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#ffffff'
  },
  body: {
    padding: 5,
    paddingTop: 25
  },
  cameraView: {
    display: 'flex',
    flex:1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    width: '100%',
    height: '100%',
    paddingTop: 10
  },
  camera : {
    width: 700/2,
    height: 800/2,
    zIndex: 1,
    borderWidth: 0,
    borderRadius: 0,
  },
  translationView: {
    marginTop: 30, 
    padding: 20,
    borderColor: '#cccccc',
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    height: 500
  },
  translationTextField: {
    fontSize:60
  },
  wordTextField: {
    textAlign:'right', 
    fontSize:20, 
    marginBottom: 50
  },
  legendTextField: {
    fontStyle: 'italic',
    color: '#888888'
  },
  inputAndroid: {
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'purple',
    borderStyle: 'solid',
    borderRadius: 8,
    color: 'black',
    paddingRight: 30,
    backgroundColor: '#ffffff'
  },
});

const pickerSelectStyles = StyleSheet.create({
  inputIOS: {
    fontSize: 16,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'gray',
    borderRadius: 4,
    color: 'black',
    paddingRight: 30
  },
  inputAndroid: {
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 0.5,
    borderColor: 'grey',
    borderRadius: 3,
    color: 'black',
    paddingRight: 30,
    backgroundColor: '#cccccc'
  },
});
import React, { useState, useEffect } from 'react';

//react native
import { ActivityIndicator, Text, View, ScrollView, StyleSheet, Button, Platform } from 'react-native';


//Expo
import Constants from 'expo-constants';
import * as Permissions from 'expo-permissions';
import { Camera } from 'expo-camera';

//Tensorflow
import * as tf from '@tensorflow/tfjs';
import * as mobilenet from '@tensorflow-models/mobilenet';
import {cameraWithTensors} from '@tensorflow/tfjs-react-native';

//disable yellow warnings on EXPO client!
console.disableYellowBox = true;

export default function App() {

  //------------------------------------------------
  //state variables for image/translation processing
  //------------------------------------------------
  
  const [predictionFound, setPredictionFound] = useState(false);
  const [hasPermission, setHasPermission] = useState(null);

  const [prediction, setPrediction] = useState('')

  //Tensorflow and Permissions
  const [mobilenetModel, setMobilenetModel] = useState(null);
  const [frameworkReady, setFrameworkReady] = useState(false);


  //TF Camera Decorator
  const TensorCamera = cameraWithTensors(Camera);

  //RAF ID
  let requestAnimationFrameId = 0;

  //performance hacks (Platform dependent)
  const textureDims = Platform.OS === "ios"? { width: 1080, height: 1920 } : { width: 1600, height: 1200 };
  const tensorDims = { width: 152, height: 200 }; 

  //-----------------------------
  // Run effect once
  // 1. Check camera permissions
  // 2. Initialize TensorFlow
  // 3. Load Mobilenet Model
  //-----------------------------
  useEffect(() => {
    if(!frameworkReady) {
      (async () => {

        //check permissions
        const { status } = await Camera.requestPermissionsAsync();
        console.log(`permissions status: ${status}`);
        setHasPermission(status === 'granted');

        //we must always wait for the Tensorflow API to be ready before any TF operation...
        await tf.ready();

        //load the mobilenet model and save it in state
        setMobilenetModel(await loadMobileNetModel());

        setFrameworkReady(true);
      })();
    }
  }, []);

  //--------------------------
  // Run onUnmount routine
  // for cancelling animation 
  // if running to avoid leaks
  //--------------------------
  useEffect(() => {
    return () => {
      cancelAnimationFrame(requestAnimationFrameId);
    };
  }, [requestAnimationFrameId]);

  

  //-----------------------------------------------------------------
  // Loads the mobilenet Tensorflow model: 
  // https://github.com/tensorflow/tfjs-models/tree/master/mobilenet
  // Parameters:
  // 
  // NOTE: Here, I suggest you play with the version and alpha params
  // as they control performance and accuracy for your app. For instance,
  // a lower alpha increases performance but decreases accuracy. More
  // information on this topic can be found in the link above.  In this
  // tutorial, I am going with the defaults: v1 and alpha 1.0
  //-----------------------------------------------------------------
  const loadMobileNetModel = async () => {
    const model = await mobilenet.load();
    return model;
  }


  //----------------------------------------------------------------------------------------
  // MobileNet tensorflow model classify operation returns an array of prediction objects 
  // with this structure: prediction = [ {"className": "object name", "probability": 0-1 } ]
  // where:
  // className = The class of the object being identified. Currently, this model identifies 1000 different classes.
  // probability = Number between 0 and 1 that represents the prediction's probability 
  // Example (with a topk parameter set to 3 => default):
  // [
  //   {"className":"joystick","probability":0.8070220947265625},
  //   {"className":"screen, CRT screen","probability":0.06108357384800911},
  //   {"className":"monitor","probability":0.04016926884651184}
  // ]
  // In this case, we use topk set to 1 as we are interested in the higest result for
  // both performance and simplicity. This means the array will return 1 prediction only!
  //----------------------------------------------------------------------------------------
  const getPrediction = async(tensor) => {
    if(!tensor) { return; }

    //topk set to 1
    const prediction = await mobilenetModel.classify(tensor, 1);
    console.log(`prediction: ${JSON.stringify(prediction)}`);

    if(!prediction || prediction.length === 0) { return; }
    
    //only attempt translation when confidence is higher than 20%
    if(prediction[0].probability > 0.3) {

      //stop looping!
      cancelAnimationFrame(requestAnimationFrameId);
      setPredictionFound(true);
      setPrediction(prediction[0].className)

      //get translation!
    }
  }

  //------------------------------------------------------------------------------
  // Helper function to handle the camera tensor streams. Here, to keep up reading
  // input streams, we use requestAnimationFrame JS method to keep looping for 
  // getting better predictions (until we get one with enough confidence level).
  // More info on RAF:
  // https://developer.mozilla.org/en-US/docs/Web/API/window/requestAnimationFrame
  //------------------------------------------------------------------------------
  const handleCameraStream = (imageAsTensors) => {
    const loop = async () => {
      const nextImageTensor = await imageAsTensors.next().value;
      await getPrediction(nextImageTensor);
      requestAnimationFrameId = requestAnimationFrame(loop);
    };
    if(!predictionFound) loop();
  }

  //------------------------------------------------------
  // Helper function to reset all required state variables 
  // to start a fresh new translation routine! 
  //------------------------------------------------------
  const loadNewPrediction = () => {
    setPrediction('');
    setPredictionFound(false);
  }

  const showPredictionView = () => { 
    return  <View style={styles.translationView}>
              {
                predictionFound ?
                  <View>
                    <ScrollView style={{height:400}}>
                      <Text style={styles.wordTextField}>{prediction}</Text>
                    </ScrollView>
                    <Button color='#9400D3' title="Check new prediction" onPress={() => loadNewPrediction()}/>
                  </View>
                : <ActivityIndicator size="large"/>
              }
            </View>
  }

  //--------------------------------------------------------------------------------
  // Helper function to show the Camera View. 
  //
  // NOTE: Please note we are using TensorCamera component which is constructed 
  // on line: 37 of this function component. This is just a decorated expo.Camera 
  // component with extra functionality to stream Tensors, define texture dimensions
  // and other goods. For further research:
  // https://js.tensorflow.org/api_react_native/0.2.1/#cameraWithTensors
  //--------------------------------------------------------------------------------
  const renderCameraView = () => {
    return <View style={styles.cameraView}>
                <TensorCamera
                  style={styles.camera}
                  type={Camera.Constants.Type.back}
                  zoom={0}
                  cameraTextureHeight={textureDims.height}
                  cameraTextureWidth={textureDims.width}
                  resizeHeight={tensorDims.height}
                  resizeWidth={tensorDims.width}
                  resizeDepth={3}
                  onReady={(imageAsTensors) => handleCameraStream(imageAsTensors)}
                  autorender={true}
                />
            </View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>
          My Pictionary
        </Text>
      </View>

      <View style={styles.body}>
        {predictionFound ? showPredictionView() : renderCameraView() }
      </View>  
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-start',
    paddingTop: Constants.statusBarHeight,
    backgroundColor: '#E8E8E8',
  },
  header: {
    backgroundColor: '#41005d'
  },
  title: {
    margin: 10,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    color: '#ffffff'
  },
  body: {
    padding: 5,
    paddingTop: 25
  },
  cameraView: {
    display: 'flex',
    flex:1,
    flexDirection: 'column',
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    width: '100%',
    height: '100%',
    paddingTop: 10
  },
  camera : {
    width: 700/2,
    height: 800/2,
    zIndex: 1,
    borderWidth: 0,
    borderRadius: 0,
  },
  translationView: {
    marginTop: 30, 
    padding: 20,
    borderColor: '#cccccc',
    borderWidth: 1,
    borderStyle: 'solid',
    backgroundColor: '#ffffff',
    marginHorizontal: 20,
    height: 500
  },
  translationTextField: {
    fontSize:60
  },
  wordTextField: {
    textAlign:'right', 
    fontSize:20, 
    marginBottom: 50
  },
  legendTextField: {
    fontStyle: 'italic',
    color: '#888888'
  },
  inputAndroid: {
    fontSize: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'purple',
    borderStyle: 'solid',
    borderRadius: 8,
    color: 'black',
    paddingRight: 30,
    backgroundColor: '#ffffff'
  },
});


