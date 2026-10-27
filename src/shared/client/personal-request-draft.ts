export type PersonalRequestReview={operationId:string;requestType:string;summary:string};
export type PersonalRequestDraft={requestType:string;summary:string;review:PersonalRequestReview|null;attempted:boolean};
export function emptyPersonalRequestDraft():PersonalRequestDraft{return {requestType:'CERTIFICATE',summary:'',review:null,attempted:false}}
