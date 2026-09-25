import {NextResponse} from "next/server";
export async function GET(){return NextResponse.json({ok:true,service:"mb-optica",version:"0.1.0",timestamp:new Date().toISOString()})}