// Keyboard navigation changes the highlighted suggestion, never membership.
export function moveSearchSelection(index,key,count){
  if(!Number.isInteger(count)||count<=0)return -1;
  const current=Number.isInteger(index)&&index>=0&&index<count?index:-1;
  if(key==='Home')return 0;
  if(key==='End')return count-1;
  if(key==='ArrowDown')return current<0?0:(current+1)%count;
  if(key==='ArrowUp')return current<0?count-1:(current-1+count)%count;
  return current;
}
export function selectedSearchSymbol(results,index){return Array.isArray(results)&&Number.isInteger(index)&&index>=0&&index<results.length?results[index]?.symbol||null:null;}
