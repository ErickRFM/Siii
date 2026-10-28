import type {PersonalSnapshot} from './use-personal-snapshot';

/** A dashboard must not confuse partial published grades with official transcript KPIs. */
export function institutionalStudentSummary(snapshot:PersonalSnapshot){
 const incomplete={
  grades:snapshot.truncatedResources?.grades===true,
  courses:snapshot.truncatedResources?.courses===true,
  orders:snapshot.truncatedResources?.orders===true,
  pendingRequests:snapshot.truncatedResources?.pendingRequests===true,
  announcements:snapshot.truncatedResources?.announcements===true
 };
 const grades=new Map<string,(typeof snapshot.grades)[number]>();
 for(const row of snapshot.grades){
  const key=row.sectionId||row.id;
  const previous=grades.get(key);
  if(!previous||row.version>previous.version)grades.set(key,row);
 }
 const published=[...grades.values()];
 const publishedKeys=new Set(published.map(row=>row.sectionId));
 const eligible=new Set(snapshot.courses.map(course=>course.sectionId));
 const available=eligible.size;
 const gradedEnrolled=[...publishedKeys].filter(key=>eligible.has(key)).length;
 const gradeMean=published.length?published.reduce((total,row)=>total+row.scoreHundredths,0)/published.length/100:null;
 const creditsWithPublishedGrade=published.reduce((total,row)=>total+Math.max(0,row.credits||0),0);
 const outstanding=snapshot.orders
   .filter(order=>order.status==='pending'||order.status==='partially_paid')
   .reduce((total,order)=>total+Math.max(0,order.totalAmountCents-order.paidAmountCents),0);
 const currencies=new Set(snapshot.orders.map(order=>order.currency));
 const currency=currencies.size===1?snapshot.orders[0]?.currency:null;
 const byTerm=new Map<string,number>();
 for(const row of published)byTerm.set(row.termName,(byTerm.get(row.termName)||0)+1);
 return {
  incomplete,published,gradeMean,creditsWithPublishedGrade,
  enrolledSections:available,
  publishedEnrolledSections:gradedEnrolled,
  publicationRatio:available?100*gradedEnrolled/available:null,
  outstanding, currency,
  pendingCount:snapshot.pendingRequests.length,
  terms:[...byTerm.entries()].slice(-4).map(([name,count])=>({name,count}))
 };
}
