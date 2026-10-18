import IdCardClient from "@/components/IdCard";
import { requireActiveStudent } from "@/lib/auth";
import { buildQrPayload } from "@/lib/qr";
import { UNIVERSITY_NAME } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata = { title: "My ID Card" };

export default async function IdCardPage() {
  const student = await requireActiveStudent();
  const qrPayload = buildQrPayload(student.id, student.qr_secret);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Digital student ID card</h1>
        <p className="text-sm text-slate-500">
          Rendered live from your student record — nothing is stored as an
          image. Download and print it yourself.
        </p>
      </div>
      <IdCardClient
        university={UNIVERSITY_NAME}
        qrPayload={qrPayload}
        student={{
          id: student.id,
          name: student.name,
          year: student.year,
          photo_url: student.photo_url,
          phone: student.phone,
          email: student.email,
          major: student.major,
          class_name: student.class_name,
        }}
      />
    </div>
  );
}
