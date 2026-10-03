import {NextResponse} from "next/server";
import {z} from "zod";
import {requireRole} from "@/lib/auth";

const MAX_TOTAL_BYTES=30*1024*1024;
const MAX_FILE_BYTES=10*1024*1024;
const MAX_FILES=10;

const emailList=(value:string)=>value.split(/[;,\n]+/).map(v=>v.trim()).filter(Boolean);

const schema=z.object({
  to:z.string().trim().min(1),
  cc:z.string().optional().default(""),
  bcc:z.string().optional().default(""),
  subject:z.string().trim().min(1).max(200),
  text:z.string().max(20000).default(""),
  replyTo:z.string().email().optional(),
  replyMessageId:z.string().max(998).optional()
});

export const runtime="nodejs";

export async function POST(req:Request){
  try{
    const actor=await requireRole(["ADMIN","GERENTE","VENDEDOR","FINANCEIRO","LABORATORIO"]);
    const key=process.env.RESEND_API_KEY;
    const from=actor.mbEmail||process.env.RESEND_FROM;
    if(!key)return NextResponse.json({error:"RESEND_API_KEY não configurada."},{status:503});
    if(!from)return NextResponse.json({error:"Configure o e-mail MB do usuário ou RESEND_FROM."},{status:422});

    const form=await req.formData();
    const raw={
      to:String(form.get("to")||""),
      cc:String(form.get("cc")||""),
      bcc:String(form.get("bcc")||""),
      subject:String(form.get("subject")||""),
      text:String(form.get("text")||""),
      replyTo:String(form.get("replyTo")||"")||undefined,
      replyMessageId:String(form.get("replyMessageId")||"")||undefined
    };
    const body=schema.parse(raw);

    const to=emailList(body.to);
    const cc=emailList(body.cc);
    const bcc=emailList(body.bcc);
    const all=[...to,...cc,...bcc];
    if(!to.length||all.some(email=>!z.string().email().safeParse(email).success)){
      return NextResponse.json({error:"Informe destinatários válidos em Para, Cc ou Cco."},{status:422});
    }

    const files=form.getAll("attachments").filter((v):v is File=>typeof File!=="undefined"&&v instanceof File&&v.size>0);
    if(files.length>MAX_FILES)return NextResponse.json({error:"É permitido anexar no máximo 10 arquivos por e-mail."},{status:422});

    const totalBytes=files.reduce((sum,file)=>sum+file.size,0);
    if(files.some(file=>file.size>MAX_FILE_BYTES)){
      return NextResponse.json({error:"Cada anexo pode ter no máximo 10 MB."},{status:422});
    }
    if(totalBytes>MAX_TOTAL_BYTES){
      return NextResponse.json({error:"O tamanho total dos anexos pode ser de no máximo 30 MB."},{status:422});
    }

    const attachments=await Promise.all(files.map(async file=>({
      filename:file.name,
      content:Buffer.from(await file.arrayBuffer()).toString("base64"),
      content_type:file.type||"application/octet-stream"
    })));

    const payload:any={
      from,
      to,
      subject:body.subject,
      text:body.text,
      reply_to:body.replyTo||actor.mbEmail||actor.email
    };
    if(cc.length)payload.cc=cc;
    if(bcc.length)payload.bcc=bcc;
    if(attachments.length)payload.attachments=attachments;
    if(body.replyMessageId){
      payload.headers={
        "In-Reply-To":body.replyMessageId,
        "References":body.replyMessageId
      };
    }

    const r=await fetch("https://api.resend.com/emails",{
      method:"POST",
      headers:{
        Authorization:"Bearer "+key,
        "Content-Type":"application/json",
        "Idempotency-Key":crypto.randomUUID()
      },
      body:JSON.stringify(payload)
    });
    const data=await r.json().catch(()=>({}));
    if(!r.ok)return NextResponse.json({error:data?.message||"Não foi possível enviar o e-mail."},{status:r.status});
    return NextResponse.json({ok:true,data});
  }catch(error){
    if(error instanceof z.ZodError)return NextResponse.json({error:"Preencha destinatário, assunto e mensagem corretamente."},{status:422});
    return NextResponse.json({error:String(error)},{status:401});
  }
}
