export type PersonalProfile={id:string;firstName:string;lastName:string;status:string;institutionalEmail:string|null;verifiedEmail:string|null;timeZone:string;enrollmentNumber?:string;employeeNumber?:string;programName?:string;programCode?:string};
export type PersonalAnnouncement={id:string;title:string;body:string;publishedAt:string|null};
export type PersonalCourse={id:string;sectionId:string;sectionCode:string;sectionStatus:string;courseCode:string;courseName:string;credits:number;termId:string;termName:string;termStart:string;termEnd:string;enrollmentStatus?:string;enrolledCount?:number;published?:boolean};
export type PersonalTeacher={id:string;sectionId:string;sectionCode:string;courseName:string;firstName:string;lastName:string;termName:string};
export type PersonalSchedule=PersonalCourse&{date:string;state:string;reason:string|null;startMinute:number;endMinute:number;roomCode:string;roomBuilding:string;campusName:string};
export type PersonalGrade=PersonalCourse&{scoreHundredths:number;version:number;publishedAt:string};
export type PersonalOrder={id:string;orderNumber:string;feeTypeName:string;totalAmountCents:number;paidAmountCents:number;currency:string;status:string;dueDate:string|null;enrollmentNumber?:string;studentFirstName?:string;studentLastName?:string};
export type PersonalPayment={id:string;transactionNumber:string;orderNumber:string;amountCents:number;paymentMethod:string;reference:string|null;currency:string;createdAt:string};
export const financeStatus:Record<string,string>={pending:'Pendiente',partially_paid:'Pago parcial',paid:'Pagada',cancelled:'Cancelada',waived:'Exenta',refunded:'Devuelta'};
export const academicStatus:Record<string,string>={active:'Activo',inactive:'Inactivo',withdrawn:'Baja',graduated:'Egresado',open:'Abierto',closed:'Cerrado',archived:'Archivado',enrolled:'Inscrito'};
export const formatMoney=(cents:number,currency:string)=>new Intl.NumberFormat('es-MX',{style:'currency',currency}).format(cents/100);

export type PersonalTeachingGroup=PersonalCourse&{termStatus:string;componentCount:number;weightTotal:number;savedScoreCount:number};
