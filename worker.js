const {
	isMainThread, parentPort, workerData
} = require('worker_threads');
if(isMainThread) { // Safeguard against running this file instead of cabbr.js
	console.log("You're doing it wrong: Open cabbr.js instead");
	process.exit(0);
} else {
	var {stereoTest, sampleRate, reportEvery, stereo, expr, mode, skipNaNs, fancy} = workerData;
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
	var valid = true;
	try {
		var testRun = mode3 ? (func = func())(0,sampleRate) : func(0);
	} catch(e) {
		valid = false;
	}
	if(!stereoTest) {
		var data = [];
		var range = [parseInt(process.argv[2]),parseInt(process.argv[3])];
		var divisor = Math.floor(sampleRate/reportEvery);
		var consolelog = fancy !== 0 ? console.log : ()=>{};
		var report = fancy !== 0 && reportEvery > 0 ? t=>{if(t % divisor == stereo) parentPort.postMessage(process.argv[4]+';'+((t-range[0])/(range[1]-range[0])*100)+'%');} : ()=>{};
		(async()=>{ // doing this is faster than doing it "the right way", apparently
			if(stereo) {
				switch(mode) {
					case 0:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(+t);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t*2] = res[0];
							data[t*2+1] = res[1];
							report(t);
						}
						break;
					case 1:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(+t);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t*2] = res[0]+128;
							data[t*2+1] = res[1]+128;
							report(t);
						}
						break;
					case 2:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(+t);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t*2] = Math.max(Math.min(res[0],1),-1)*127+127;
							data[t*2+1] = Math.max(Math.min(res[1],1),-1)*127+127;
							report(t);
						}
						break;
					case 3:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(t/sampleRate,sampleRate);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t*2] = Math.max(Math.min(res[0],1),-1)*127+127;
							data[t*2+1] = Math.max(Math.min(res[1],1),-1)*127+127;
							report(t);
						}
						break;
				}
			} else {
				switch(mode) {
					case 0:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(+t);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t] = res;
							report(t);
						}
						break;
					case 1:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(+t);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t] = res+128;
							report(t);
						}
						break;
					case 2:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(+t);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t] = Math.max(Math.min(res,1),-1)*127+127;
							report(t);
						}
						break;
					case 3:
						for (var t = range[0]; t<range[1]; t++) {
							let res = NaN;
							try {
								res = func(t/sampleRate,sampleRate);
							} catch (error) {
								consolelog('Error at %d: %s\x1b[1F',t,error.message);
							}
							if(skipNaNs && isNaN(res)) continue;
							data[t] = Math.max(Math.min(res,1),-1)*127+127;
							report(t);
						}
						break;
				}
			}
			parentPort.postMessage([parseInt(process.argv[4])-1,data]);
		})();
	}
	else parentPort.postMessage([Array.isArray(testRun),valid]);
}
