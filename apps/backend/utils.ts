import crypto from "crypto";

export function encrypt(text: string): string {
  const encryptionKey = process.env.ENCRYPTION_KEY!;
  
  const iv = crypto.randomBytes(16);

  const keyBuffer = Buffer.from(encryptionKey, 'hex');
  
  const cipher = crypto.createCipheriv("aes-256-cbc", keyBuffer, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}


export function decrypt(text: string): string {
  const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex');
  
  const parts = text.split(":");
  const iv = Buffer.from(parts[0], "hex");
  const encryptedText = parts[1];
  
  const decipher = crypto.createDecipheriv("aes-256-cbc", keyBuffer, iv);
  let decrypted = decipher.update(encryptedText!, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted; // Returns base58 string
}