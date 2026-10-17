import {mkdirSync,existsSync,lstatSync,unlinkSync} from "node:fs";
import {dirname} from "node:path";
import {createPdfWorkerServer} from "./services/pdf-worker-server.js";
import {renderPodPdf} from "./services/pdf-renderer.service.js";

const socket=process.env.PDF_WORKER_SOCKET??"/run/pdf/renderer.sock";
if(process.platform==="win32"||!socket.startsWith("/run/pdf/"))throw Error("PDF worker requires its dedicated Linux socket volume");
process.env.PDF_WORKER_PROCESS="true";process.umask(0o077);
mkdirSync(dirname(socket),{recursive:true,mode:0o700});
if(existsSync(socket)){if(!lstatSync(socket).isSocket())throw Error("Unexpected worker socket path");unlinkSync(socket);}
const server=createPdfWorkerServer(renderPodPdf);
server.listen(socket,()=>console.log("Isolated PDF worker ready"));
const shutdown=()=>{server.close(()=>{if(existsSync(socket))unlinkSync(socket);process.exit(0);});setTimeout(()=>process.exit(1),20000).unref();};
process.once("SIGTERM",shutdown);process.once("SIGINT",shutdown);
