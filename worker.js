const {
	isMainThread, parentPort, workerData
} = require('worker_threads');
if(isMainThread) { // Safeguard against running this file instead of cabbr.js
	console.log("You're doing it wrong: Open cabbr.js instead");
	process.exit(0);
} else {
	var {stereoTest, sampleRate, reportEvery, stereo, expr, mode, skipNaNs} = workerData;
	var fakeWindow = {};
	var mathNames = Object.getOwnPropertyNames(Math);
	var mathProps = mathNames.map((prop) => {
		return Math[prop];
	});
	mathNames.push('int','window');
	mathProps.push(Math.floor,fakeWindow);
	var mode3 = mode == 3;
	var prefunc = mode3 ? new Function(...mathNames, expr) : new Function(...mathNames, 't', 'return 0,'+expr);
	var func = prefunc.bind(null,...mathProps);
	var range = [parseInt(process.argv[2]),parseInt(process.argv[3])];
	var data = [];
	var testRun = mode3 ? (func = func())(0,sampleRate) : func(0);
	if(!stereoTest) (async()=>{
		for (var t = range[0]; t<range[1]; t++) {
			var res = NaN;
			try {
				res = mode3 ? func(t/sampleRate,sampleRate) : func(+t);
			} catch (error) {
				console.log('Error at %d: %s\x1b[1F',t,error.message);
			}
			if(skipNaNs && isNaN(res)) continue;
			if(stereo) {
				switch(mode) {
					case 0:
						data[t*2] = res[0];
						data[t*2+1] = res[1];
						break;
					case 1:
						data[t*2] = res[0]+128;
						data[t*2+1] = res[1]+128;
						break;
					case 2:
					case 3:
						data[t*2] = Math.max(Math.min(res[0],1),-1)*127+127;
						data[t*2+1] = Math.max(Math.min(res[1],1),-1)*127+127;
						break;
				}
			} else {
				switch(mode) {
					case 0:
						data[t] = res;
						break;
					case 1:
						data[t] = res+128;
						break;
					case 2:
					case 3:
						data[t] = Math.max(Math.min(res,1),-1)*127+127;
						break;
				}
			}
			if(reportEvery > 0 && t % Math.floor(sampleRate/reportEvery) == stereo) parentPort.postMessage(process.argv[4]+';'+((t-range[0])/(range[1]-range[0])*100)+'%');
		}
		parentPort.postMessage([parseInt(process.argv[4])-1,data]);
	})();
	else parentPort.postMessage(Array.isArray(testRun));
}
