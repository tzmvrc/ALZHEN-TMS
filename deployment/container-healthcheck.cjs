const http=require('node:http');
const options=process.argv[2]==='pdf'?{socketPath:process.env.PDF_WORKER_SOCKET||'/run/pdf/renderer.sock',path:'/health'}:{host:'127.0.0.1',port:process.env.PORT||5000,path:'/api/health'};
const req=http.get(options,res=>{res.resume();process.exitCode=res.statusCode===200?0:1;});
req.setTimeout(3000,()=>req.destroy());req.on('error',()=>{process.exitCode=1;});
