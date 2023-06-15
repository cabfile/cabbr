console.log('Loading...');
var fs = require('fs');
var ini = require('ini');
var config = ini.parse(fs.readFileSync('./config.ini', 'utf-8'));

// Get variables from ini
var {type, stereo, seconds, sampleRate} = config.General;
var {upscale, resample, resampleMethod, bits} = config.Quality;
var {tLength, workers} = config.Advanced;
var {reportEvery, invalidSamples} = config.Misc;
var skipNaNs = false;

(()=>{ // change variables into their proper types
	type = parseInt(type);
	stereo = Boolean(stereo);
	seconds = parseFloat(seconds);
	sampleRate = parseInt(sampleRate);
	upscale = parseFloat(upscale);
	resample = parseInt(resample);
	tLength = parseInt(tLength);
	workers = workers=='auto'?Math.min(10,Math.ceil(seconds/15)):parseInt(workers);
	reportEvery = parseFloat(reportEvery);
	invalidSamples = parseInt(invalidSamples);
	bits = parseInt(bits);
	skipNaNs = invalidSamples == 1;
})(); // this is so you can retract it
var pcm = require('./pcm.js');
const { Worker } = require('worker_threads');
var waveResampler;
if(resample > 0 && resample != sampleRate) waveResampler = require('wave-resampler');
var data = [];
var expr = fs.readFileSync('expr.txt','utf8');
if(expr.trim().substring(0,20) == 'eval(unescape(escape') {
	console.log('Optimizing...');
	expr = expr.trim().replace(
		/^eval\(unescape\(escape`(.*?)`.replace\(\/u\(\.\.\)\/g,["']\$1%["']\)\)\)$/,
		(match, m1) => unescape(escape(m1).replace(/u(..)/g, '$1%')));
	fs.writeFileSync('expr_optimized.txt',expr,'utf8');
	console.log('Optimized version saved as expr_optimized.txt');
}
if(upscale > 0 && upscale !== 1) {
	sampleRate *= upscale;
	expr = 't/='+upscale+','+expr;
	console.log('Upscaled x'+upscale+' (sample rate = '+sampleRate+')');
}
if(stereo) {
	seconds *= 2;
	expr = 't/=2,'+expr;
}
var length = tLength > 0 ? tLength : seconds*sampleRate;
var workerArray = [], doneWorkers = [];
var parts = [];
var part = length/workers;
var percents = [0,0,0,0];
async function process() {
	console.log('Processing...\nProgress:\nWorkers:');
	console.time('Processing');
	var workersFinished = 0;
	for (var i = 0; i<workers; i++) {
		workerArray.push(new Worker('./worker',{argv:[part*i,part*(i+1),i+1],workerData:{seconds,sampleRate,reportEvery,type,expr,stereo,skipNaNs}}));
		doneWorkers.push(0);
		workerArray[workerArray.length-1].on('message',m=>{
			if(typeof m === 'string') {
				if(m.endsWith('%')) {
					let d = m.split(';');
					let number = parseInt(d[0]);
					percents[number-1] = parseFloat(d[1].substring(0,d[1].length-1));
					let a = 0;
					percents.forEach(p=>a+=p/workers);
					console.log('\x1b[2AProgress: %s %d\% \nWorkers : %s',progressBar(a),a.toFixed(1),getWorkers(doneWorkers));
				} else {
					console.log(m);
				}
			} else if(m[0] === 'Done') doneWorkers[m[1]] = 1
			  else parts[m[0]] = m[1];
		});
		workerArray[workerArray.length-1].on('exit',()=>{
			workersFinished++;
			if(workersFinished == workers) {
				console.log('\x1b[2FProgress: %s 100.0\%\nWorkers : %s',progressBar(100),getWorkers(doneWorkers))
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
					data = [...waveResampler.resample(data, sampleRate, resample,{method:resampleMethod,LPF:false})];
					console.log('Resampled from '+sampleRate+'hz to '+resample+'hz sample rate');
				}
				if(bits == 16) {
					console.log('Converting to 16 bits...');
					var newData = [];
					for(let o = 0; o < data.length; o++) {
						let the = (data[o] - 128) << 8;
						newData[o*2] = convertIt(the,0);
						newData[o*2+1] = convertIt(the,1);
					}
					data = newData;
				} else if(bits != 8) console.log('Invalid amount of bits. Defaulting to 8. (no change)');
				console.log('Writing...');
				var the = new pcm({channels: stereo?2:1, rate: waveResampler?resample:sampleRate, depth: bits===16?16:8});
				var wave = the.toWav(data);
				fs.writeFileSync('out.wav',Buffer.from(wave));
			}
		});
	}
}
process();

function convertToNumbers(...args) {
	for(let i = 0; i < args.length; i++) {
		args[i] = Number(args[i]);
	}
}

function progressBar(percentage) {
	return '\x1b[106;30m['+(''.padEnd((percentage/100)*60,'#').padEnd(60,'.').replaceAll('#','\x1b[42;32m#\x1b[0m').replaceAll('.','\x1b[41;31m.\x1b[0m'))+'\x1b[106;30m]\x1b[0m'
}

function getWorkers(array) {
	let out = '';
	array.forEach((elem,idx,arr)=>{
		out+= (elem?'\x1b[32m':'\x1b[31m')+String(idx+1)+'\x1b[0m, '
	})
	return out.slice(0,-2);
}

function convertIt(int16,num) {
	if(num === 0) {
		return int16%256;
	} else if(num === 1) {
		return Math.floor(int16/256)%256;
	}
}