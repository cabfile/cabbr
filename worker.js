const {
	Worker, isMainThread, parentPort, workerData
} = require('worker_threads');
if(isMainThread) {
	console.log('you are doing it wrong');
	process.exit(0);
} else {
	var sampleRate = workerData.sampleRate;
	var seconds = workerData.seconds;
	var reportEvery = workerData.reportEvery;
	var stereo = workerData.stereo;
	var expr = workerData.expr;
	var type = workerData.type;
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
			var res = func(Number(t));
			if(stereo) {
				switch(type) {
					case 0:
						data[t] = res[0];
						data[t+1] = res[1];
						break;
					case 1:
						data[t] = res[0]+128;
						data[t+1] = res[1]+128;
						break;
					case 2:
						data[t] = Math.max(Math.min(res[0],1),-1)*127+127;
						data[t+1] = Math.max(Math.min(res[1],1),-1)*127+127;
						break;
				}
				t++;
			} else {
				switch(workerData.type) {
					case 0:
						data[t] = res;
						break;
					case 1:
						data[t] = res+128;
						break;
					case 2:
						data[t] = Math.max(Math.min(res,1),-1)*127+127;
						break;
				}
			}
			if(reportEvery > 0 && t%Math.round(sampleRate/reportEvery)==stereo) parentPort.postMessage(process.argv[4]+';'+((t-range[0])/(range[1]-range[0])*100)+'%');
		}
		console.log('Worker #'+process.argv[4]+' done! Transferring '+prettyPrintSize((range[1]-range[0])*(stereo+1))+' of data...');
		parentPort.postMessage([parseInt(process.argv[4])-1,data]);
		console.log('Data transfer from worker #'+process.argv[4]+' completed!');
	})();
}

function prettyPrintSize(num) {
	if(num < 1024) return num+'b';
	else if(num < 1048576) return Math.round(num/1024)+'kb';
	else if(num < 1073741824) return Math.round(num/1048576)+'mb';
	else return Math.round(num/1073741824)+'gb';
}