const {
	isMainThread, parentPort, workerData
} = require('worker_threads');
if(isMainThread) { // Safegaurd against running this file instead of cabbr.js
	console.log('You\'re doing it wrong: Open cabbr.js instead');
	process.exit(0);
} else {
	var {sampleRate, reportEvery, stereo, expr, type, skipNaNs} = workerData;
	var fakeWindow = {};
	var mathNames = Object.getOwnPropertyNames(Math);
	var mathProps = mathNames.map((prop) => {
		return Math[prop];
	});
	mathNames.push('int','window');
	mathProps.push(Math.floor,fakeWindow);
	var prefunc = new Function(...mathNames, 't', 'return 0,'+expr);
	var func = prefunc.bind(null,...mathProps);
	var range = [parseInt(process.argv[2]),parseInt(process.argv[3])];
	var data = [];
	func(0);
	(async()=>{
		for (var t = range[0]; t<range[1]; t++) {
			var res = NaN;
			try {
				res = func(+t)
			} catch (error) {
				console.log('Error at %d: %s\x1b[1F',t,error.message);
			}
			if(skipNaNs && isNaN(res)) continue;
			if(stereo) {
				switch(type) {
					case 0:
						data[t] = +res[0];
						data[t+1] = +res[1];
						break;
					case 1:
						data[t] = +res[0]+128;
						data[t+1] = +res[1]+128;
						break;
					case 2:
						data[t] = Math.max(Math.min(+res[0],1),-1)*127+127;
						data[t+1] = Math.max(Math.min(+res[1],1),-1)*127+127;
						break;
				}
				t++;
			} else {
				switch(workerData.type) {
					case 0:
						data[t] = +res;
						break;
					case 1:
						data[t] = +res+128;
						break;
					case 2:
						data[t] = Math.max(Math.min(+res,1),-1)*127+127;
						break;
				}
			}
			if(reportEvery > 0 && t%Math.round(sampleRate/reportEvery)==stereo) parentPort.postMessage(process.argv[4]+';'+((t-range[0])/(range[1]-range[0])*100)+'%');
		}
		parentPort.postMessage([parseInt(process.argv[4])-1,data]);
		console.log('Worker #'+process.argv[4]+' is done! (%s)\x1b[1F',prettyPrintSize(data.length));
	})();
}

function prettyPrintSize(num) {
	if(num < 1024) return num+'b';
	else if(num < 1048576) return Math.round(num/1024)+'kb';
	else if(num < 1073741824) return Math.round(num/1048576)+'mb';
	else return Math.round(num/1073741824)+'gb';
}