const fs = require('fs');
const os = require('os');
const cpuCores = os.availableParallelism ? os.availableParallelism() : undefined;
const config = parseINIString((fs.readFileSync('./config.ini', 'utf-8')));

// Get variables from ini
var {mode, duration, durationType, sampleRate} = config.General;
var {upscale, resample, resampleMethod, bits} = config.Quality;
var {workers, invalidSamples} = config.Advanced;
var {reportEvery} = config.Misc;
var skipNaNs = false;

(()=>{ // change variables into their proper types
	mode = parseInt(mode);
	duration = parseFloat(duration);
	durationType = parseInt(durationType);
	sampleRate = parseInt(sampleRate);
	upscale = parseFloat(upscale);
	resample = parseInt(resample);
	workers = workers=='max'?(cpuCores?(console.log('Using CPU core count: %d workers',cpuCores),cpuCores):(console.log('The "max" settings requires at least Node.JS v18.14.0. Using 1 worker'),1)):parseInt(workers);
	reportEvery = parseFloat(reportEvery);
	invalidSamples = parseInt(invalidSamples);
	bits = parseInt(bits);
	skipNaNs = invalidSamples == 1;
})(); // this is so you can retract it
const pcm = require('./pcm.js');
const { Worker } = require('worker_threads');
var waveResampler;
if(resample > 0 && resample != sampleRate) {
	try {
		waveResampler = require('wave-resampler');
	} catch(e) {
		console.log("Resampling is enabled but you don't seem to have wave-resampler installed.");
		console.log('Install it by entering "npm i wave-resampler".');
		console.log("In the mean time, the audio will not be resampled.");
		waveResampler = null;
	}
}
var data = [];
var expr = fs.readFileSync('expr.txt','utf8');
if(expr.trim().substring(0,20) == 'eval(unescape(escape') {
	console.log('Optimizing...');
	expr = expr.trim().replace(
		/^eval\(unescape\(escape(?:`|\('|\("|\(`)(.*?)(?:`|'\)|"\)|`\)).replace\(\/u\(\.\.\)\/g,["'`]\$1%["'`]\)\)\)$/,
		(match, m1) => unescape(escape(m1).replace(/u(..)/g, '$1%')));
	fs.writeFileSync('expr_optimized.txt',expr,'utf8');
	console.log('Optimized version saved as expr_optimized.txt');
}
if(upscale > 0 && upscale !== 1) {
	if(mode === 3) {
		console.log("Upscaling is unavailable in Funcbeat");
	} else {
		sampleRate *= upscale;
		expr = 't/='+upscale+','+expr;
		console.log('Upscaled x'+upscale+' (new sample rate: '+sampleRate+')');
	}
}
var stereo = false;
var stereoTester = new Worker('./worker',{workerData:{stereoTest:true,expr,mode}});
stereoTester.on('message',m=>{
	stereo = m;
	if(m) console.log("Stereo detected");
	process();
});
async function process() {
	const length = durationType === 1 ? duration : duration*sampleRate;
	var workerArray = [];
	var parts = [];
	var part = length/workers;
	var percents = [0,0,0,0];
	console.log('Processing...\nProgress:\nWorkers:');
	console.time('Processing');
	var workersFinished = 0;
	for (var i = 0; i<workers; i++) {
		workerArray.push(new Worker('./worker',{argv:[part*i,part*(i+1),i+1],workerData:{stereoTest:false,sampleRate,reportEvery,mode,expr,stereo,skipNaNs}}));
		workerArray[workerArray.length-1].on('message',m=>{
			if(typeof m === 'string') {
				if(m.endsWith('%')) {
					let d = m.split(';');
					let number = parseInt(d[0]);
					percents[number-1] = parseFloat(d[1].substring(0,d[1].length-1));
					let percentage = 0;
					percents.forEach(workerPercentage=> percentage += workerPercentage/workers);
					console.log('\x1b[2AProgress: %s %d\% \nWorkers : %d/%d',progressBar(percentage),percentage.toFixed(1),workersFinished,workers);
				} else {
					console.log(m);
				}
			} else parts[m[0]] = m[1];
		});
		workerArray[workerArray.length-1].on('exit',()=>{
			workersFinished++;
			if(workersFinished == workers) {
				console.log('\x1b[2FProgress: %s 100.0\%\nWorkers : %d/%d\n\x1b[1F',progressBar(100),workersFinished,workers);
				console.timeEnd('Processing');
				console.log('Merging...');
				let partCount = 0;
				parts.forEach(part=>{
					part.forEach(item=>{data.push(item);});
					partCount++;
					console.log('Part #'+partCount+' merged');
				});
				switch(invalidSamples) {
					case 2:
						let num = -1;
						console.log('Searching for an invalid sample...');
						for(let s = 0; num == -1 && s < data.length; s++) {
							if(isNaN(data[s])) {
								num = s;
								console.log('Invalid sample found at '+num);
							}
						}
						var spliced = data.splice(num,data.length-num+1);
						if(num==-1) console.log('No invalid samples were found'); else console.log('Removed '+spliced.length+' sample(s).');
						break;
					case 3:
						let nm = 0;
						let lastSample = 127;
						console.log('Searching for invalid samples...');
						for(let s = 0; s < data.length; s++) {
							if(isNaN(data[s])) {
								nm++;
								if(!isNaN(data[s-1])) lastSample = data[s-1];
								data[s] = lastSample;
							}
						}
						if(nm) console.log('Found and replaced '+nm+' invalid sample(s).'); else console.log('Found no invalid samples.');
						break;
					
				}
				if(waveResampler) {
					console.log('Resampling...');
					if(stereo) {
						var ch1 = [];
						var ch2 = [];
						for(let o = 0; o < data.length; o+=2) {
							ch1.push(data[o]);
							ch2.push(data[o+1]);
						}
						console.log('Left ear...');
						ch1 = [...waveResampler.resample(ch1, sampleRate, resample,{method:resampleMethod,LPF:false})];
						console.log('Right ear...');
						ch2 = [...waveResampler.resample(ch2, sampleRate, resample,{method:resampleMethod,LPF:false})];
						console.log('Merging channels...');
						var m = [];
						data = [];
						for(let o = 0; o < ch1.length; o++) {
							data.push(ch1[o]);
							data.push(ch2[o]);
						}
					} else data = [...waveResampler.resample(data, sampleRate, resample,{method:resampleMethod,LPF:false})];
					console.log('Resampled from '+sampleRate+'hz to '+resample+'hz sample rate');
				}
				if(bits == 16) {
					console.log('Converting to 16 bits...');
					var newData = [];
					for(let o = 0; o < data.length; o++) {
						let the = Math.round(data[o]*256-32768);
						newData[o*2] = convertIt(the,0);
						newData[o*2+1] = convertIt(the,1);
					}
					data = newData;
				} else if(bits != 8) console.log('Invalid amount of bits, defaulting to 8. (no change)');
				console.log('Writing...');
				var the = new pcm({channels: stereo?2:1, rate: waveResampler?resample:sampleRate, depth: bits===16?16:8});
				var wave = the.toWav(data);
				fs.writeFileSync('out.wav',Buffer.from(wave));
			}
		});
	}
}

function progressBar(percentage) {
	return '\x1b[106;30m['+(''.padEnd((percentage/100)*60,'#').padEnd(60,'.').replaceAll('#','\x1b[42;32m#\x1b[0m').replaceAll('.','\x1b[41;31m.\x1b[0m'))+'\x1b[106;30m]\x1b[0m';
}

function convertIt(int16,num) {
	if(num === 0) {
		return int16%256;
	} else if(num === 1) {
		return Math.floor(int16/256)%256;
	}
}

function parseINIString(t){var n={section:/^\s*\[\s*([^\]]*)\s*\]\s*$/,param:/^\s*([^=]+?)\s*=\s*(.*?)\s*$/,comment:/^\s*;.*$/},a={},t=t.split(/[\r\n]+/),e=null;return t.forEach(function(t){var s;n.comment.test(t)||(n.param.test(t)?(s=t.match(n.param),e?a[e][s[1]]=s[2]:a[s[1]]=s[2]):n.section.test(t)?(s=t.match(n.section),a[s[1]]={},e=s[1]):0==t.length&&(e=e&&null))}),a}