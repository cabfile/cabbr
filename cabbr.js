console.log('Loading...');
const fs = require('fs');
const ini = require('ini');
const cpuCores = require('os').availableParallelism();
const config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

// Get variables from ini
let {type, stereo, seconds, sampleRate} = config.General;
let {upscale, resample, resampleMethod, bits} = config.Quality;
let {tLength, workers, autoStereo} = config.Advanced;
let {reportEvery, invalidSamples} = config.Misc;
let skipNaNs = false;

(()=>{ // change variables into their proper types
	type = parseInt(type);
	stereo = Boolean(stereo);
	seconds = parseFloat(seconds);
	sampleRate = parseInt(sampleRate);
	upscale = parseFloat(upscale);
	resample = parseInt(resample);
	tLength = parseInt(tLength);
	workers = workers=='max'?(console.log('Using CPU core count: %d workers',cpuCores),cpuCores):parseInt(workers);
	reportEvery = parseFloat(reportEvery);
	invalidSamples = parseInt(invalidSamples);
	bits = parseInt(bits);
	skipNaNs = invalidSamples == 1;
	autoStereo = Boolean(autoStereo);
})(); // this is so you can retract it
const pcm = require('./pcm.js');
const { Worker } = require('worker_threads');
let waveResampler;
if(resample > 0 && resample != sampleRate) waveResampler = require('wave-resampler');
let data = [];
let expr = fs.readFileSync('expr.txt','utf8');
if(expr.trim().substring(0,20) == 'eval(unescape(escape') {
	console.log('Optimizing...');
	expr = expr.trim().replace(
		/^eval\(unescape\(escape`([^]*?)`.replace\(\/u\(\.\.\)\/g,["']\$1%["']\)\)\)$/,
		(match, m1) => unescape(escape(m1).replace(/u(..)/g, '$1%')));
	fs.writeFileSync('expr_optimized.txt',expr,'utf8');
	console.log('Optimized version saved as expr_optimized.txt');
}
if(upscale > 0 && upscale !== 1) {
	sampleRate *= upscale;
	expr = 't/='+upscale+','+expr;
	console.log('Upscaled x'+upscale+' (sample rate = '+sampleRate+')');
}
function decideAutoStereo() {
	let fakeWindow = {};
	const mathNames = Object.getOwnPropertyNames(Math);
	const mathProps = mathNames.map((prop) => {
		return Math[prop];
	});
	mathNames.push('int','window');
	mathProps.push(Math.floor,fakeWindow);
	const prefunc = new Function(...mathNames, 't', 'return 0,'+expr);
	const func = prefunc.bind(null,...mathProps);
	const result = func(0);
	stereo = Array.isArray(result);
}
if(autoStereo) decideAutoStereo();
let length = tLength > 0 ? tLength : seconds*sampleRate;
if(stereo) {
	length *= 2;
	expr = 't/=2,'+expr;
}
let workerArray = [];
let parts = [];
const part = length/workers;
let percents = [0,0,0,0];

async function process() {
	console.log('Processing...\nProgress:\nWorkers:');
	console.time('Processing');
	let workersFinished = 0;
	for (let i = 0; i<workers; i++) {
		workerArray.push(new Worker('./worker',{argv:[part*i,part*(i+1),i+1],workerData:{sampleRate,reportEvery,type,expr,stereo,skipNaNs}}));
		workerArray[workerArray.length-1].on('message',m=>{
			if(typeof m === 'string') {
				if(m.endsWith('%')) {
					const d = m.split(';');
					const number = parseInt(d[0]);
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
				console.log('\x1b[2FProgress: %s 100.0\%\nWorkers : %d/%d\n\x1b[1F',progressBar(100),workersFinished,workers)
				console.timeEnd('Processing');
				console.log('Merging...');
				let partCount = 0;
				parts.forEach(part=>{
					part.forEach(item=>{data.push(item);});
					partCount++;
					console.log('Part #'+partCount+' merged');
				});
				switch(invalidSamples) {
					case 1:
						console.log("Mode 1; no invalid sample check")
						break;
					case 2:
						let num = -1;
						console.log('Searching for an invalid sample...');
						for(let s = 0; num == -1 && s < data.length; s++) {
							if(isNaN(data[s])) {
								num = s;
								console.log('Invalid sample found at '+num);
							}
						}
						const spliced = data.splice(num,data.length-num+1);
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
					data = [...waveResampler.resample(data, sampleRate, resample,{method:resampleMethod,LPF:false})];
					console.log('Resampled from '+sampleRate+'hz to '+resample+'hz sample rate');
				}
				if(bits == 16) {
					console.log('Converting to 16 bits...');
					let newData = [];
					for(let o = 0; o < data.length; o++) {
						const the = (data[o] - 128) << 8;
						newData[o*2] = convertIt(the,0);
						newData[o*2+1] = convertIt(the,1);
					}
					data = newData;
				} else if(bits != 8) console.log('Invalid amount of bits, defaulting to 8. (no change)');
				console.log('Writing...');
				const the = new pcm({channels: stereo?2:1, rate: waveResampler?resample:sampleRate, depth: bits===16?16:8});
				const wave = the.toWav(data);
				fs.writeFileSync('out.wav',Buffer.from(wave));
			}
		});
	}
}
process();

function progressBar(percentage) {
	return '\x1b[106;30m['+(''.padEnd((percentage/100)*60,'#').padEnd(60,'.').replaceAll('#','\x1b[42;32m#\x1b[0m').replaceAll('.','\x1b[41;31m.\x1b[0m'))+'\x1b[106;30m]\x1b[0m'
}

function convertIt(int16,num) {
	if(num === 0) {
		return int16%256;
	} else if(num === 1) {
		return Math.floor(int16/256)%256;
	}
}