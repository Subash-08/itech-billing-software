'use client';
import {createContext,useContext,useState,ReactNode} from 'react';
import {seed} from '@/lib/seed';
import {State} from '@/lib/domain';
type Store={state:State;setState:React.Dispatch<React.SetStateAction<State>>;role:string;setRole:(r:string)=>void;notify:(s:string)=>void;run:(fn:(s:State)=>State,message:string)=>boolean};
const Context=createContext<Store|null>(null);
export function StoreProvider({children}:{children:ReactNode}){const [state,setState]=useState<State>(()=>structuredClone(seed));const [role,setRole]=useState('Staff');const [toast,setToast]=useState('');function notify(s:string){setToast(s);setTimeout(()=>setToast(''),4500);}function run(fn:(s:State)=>State,message:string){try{setState(fn(state));notify(message);return true;}catch(e){notify(e instanceof Error?e.message:'Please check the form.');return false;}}return <Context.Provider value={{state,setState,role,setRole,notify,run}}>{children}{toast&&<div className="toast" role="status">{toast}<button aria-label="Dismiss notification" onClick={()=>setToast('')}>×</button></div>}</Context.Provider>;}
export function useStore(){const ctx=useContext(Context);if(!ctx)throw new Error('Store not ready');return ctx;}
