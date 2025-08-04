export function b64toBlob(b64Data: string, contentType: string): Blob {
  try {
    if (!b64Data) {
      console.error('b64toBlob called with empty data');
      return new Blob([], { type: contentType });
    }
    
    console.log(`Converting base64 data to blob, length: ${b64Data.length}, content type: ${contentType}`);
    
    // Remove any data URL prefix if present
    const base64Data = b64Data.includes(',') 
      ? b64Data.split(',')[1]
      : b64Data;
      
    const byteCharacters = atob(base64Data);
    console.log(`Decoded base64 to ${byteCharacters.length} bytes`);
    
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: contentType });
    
    console.log(`Created blob of size ${blob.size} bytes with type ${contentType}`);
    return blob;
  } catch (error) {
    console.error('Error in b64toBlob conversion:', error);
    // Return an empty blob in case of error
    return new Blob([], { type: contentType });
  }
}
