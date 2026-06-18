export const sendResponse = async (res, statusCode, message, data = null) => {
  const responsePayload = {
    message,
  };
  console.log("LOG: " + message +"," + statusCode);

  if (data) {
    responsePayload.data = data;
  }

  return res.status(statusCode).json(responsePayload);
};


export const sendError = async (
    res,
    error,
    customMessage = "Terjadi kesalahan pada server"
  ) => {
    console.log("LOG: " + error +"," + customMessage);
   
  
   
  
    return res.status(500).json({ message: customMessage, Detail: error });
  };