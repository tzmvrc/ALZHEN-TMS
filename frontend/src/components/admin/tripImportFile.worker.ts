import {readImportFileOnThread} from "./tripImportFiles";

self.onmessage=async(event:MessageEvent<File>)=>{
  try{self.postMessage({files:await readImportFileOnThread(event.data)});}
  catch(error){self.postMessage({error:error instanceof Error?error.message:"Unable to parse the import file."});}
};
