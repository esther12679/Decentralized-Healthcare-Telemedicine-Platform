import { describe, it, expect, beforeEach } from 'vitest';

// Mock implementation for testing Clarity contracts
const mockClarity = () => {
  let admin = 'SP123456789ABCDEFGHI';
  let consultations = new Map();
  let availability = new Map();
  let consultationIdCounter = 0;
  
  return {
    // Mock functions to simulate contract behavior
    addAvailabilitySlot: (sender, startTime, endTime) => {
      if (endTime <= startTime) {
        return { error: 1 };
      }
      
      const slotId = consultationIdCounter++;
      const key = `${sender}-${slotId}`;
      
      availability.set(key, {
        startTime,
        endTime,
        isBooked: false
      });
      
      return { success: true, slotId };
    },
    
    bookConsultation: (sender, provider, slotId, notes) => {
      const key = `${provider}-${slotId}`;
      
      if (!availability.has(key)) {
        return { error: 404 };
      }
      
      const slot = availability.get(key);
      
      if (slot.isBooked) {
        return { error: 2 };
      }
      
      // Mark slot as booked
      slot.isBooked = true;
      availability.set(key, slot);
      
      // Create consultation
      const consultationId = consultationIdCounter++;
      consultations.set(consultationId, {
        provider,
        patient: sender,
        timestamp: slot.startTime,
        duration: slot.endTime - slot.startTime,
        status: 0, // scheduled
        notes
      });
      
      return { success: true, consultationId };
    },
    
    completeConsultation: (sender, consultationId) => {
      if (!consultations.has(consultationId)) {
        return { error: 404 };
      }
      
      const consultation = consultations.get(consultationId);
      
      if (consultation.provider !== sender) {
        return { error: 403 };
      }
      
      consultation.status = 1; // completed
      consultations.set(consultationId, consultation);
      
      return { success: true };
    },
    
    cancelConsultation: (sender, consultationId) => {
      if (!consultations.has(consultationId)) {
        return { error: 404 };
      }
      
      const consultation = consultations.get(consultationId);
      
      if (consultation.provider !== sender && consultation.patient !== sender) {
        return { error: 403 };
      }
      
      consultation.status = 2; // cancelled
      consultations.set(consultationId, consultation);
      
      return { success: true };
    },
    
    getConsultation: (consultationId) => {
      return consultations.get(consultationId) || null;
    },
    
    getProviderAvailability: (provider, slotId) => {
      const key = `${provider}-${slotId}`;
      return availability.get(key) || null;
    },
    
    transferAdmin: (sender, newAdmin) => {
      if (sender !== admin) {
        return { error: 403 };
      }
      
      admin = newAdmin;
      return { success: true };
    },
    
    // Helper for tests
    _getAdmin: () => admin,
    _getConsultations: () => consultations,
    _getAvailability: () => availability
  };
};

describe('Consultation Scheduling Contract', () => {
  let contract;
  
  beforeEach(() => {
    contract = mockClarity();
  });
  
  it('should allow a provider to add availability slot', () => {
    const provider = 'SP2PROVIDER';
    const startTime = 1672531200; // Jan 1, 2023
    const endTime = 1672534800; // Jan 1, 2023 + 1 hour
    
    const result = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    expect(result.success).toBe(true);
    expect(result.slotId).toBeDefined();
    
    const key = `${provider}-${result.slotId}`;
    expect(contract._getAvailability().has(key)).toBe(true);
    expect(contract._getAvailability().get(key).isBooked).toBe(false);
  });
  
  it('should not allow adding availability with end time before start time', () => {
    const provider = 'SP2PROVIDER';
    const startTime = 1672534800; // Later time
    const endTime = 1672531200; // Earlier time
    
    const result = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    expect(result.error).toBe(1);
  });
  
  it('should allow a patient to book a consultation', () => {
    const provider = 'SP2PROVIDER';
    const patient = 'SP3PATIENT';
    const startTime = 1672531200;
    const endTime = 1672534800;
    
    // Provider adds availability
    const addResult = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    // Patient books consultation
    const bookResult = contract.bookConsultation(
        patient,
        provider,
        addResult.slotId,
        'Initial consultation'
    );
    
    expect(bookResult.success).toBe(true);
    expect(bookResult.consultationId).toBeDefined();
    
    // Check if consultation was created
    const consultation = contract.getConsultation(bookResult.consultationId);
    expect(consultation).not.toBeNull();
    expect(consultation.provider).toBe(provider);
    expect(consultation.patient).toBe(patient);
    expect(consultation.status).toBe(0); // scheduled
    
    // Check if slot is marked as booked
    const key = `${provider}-${addResult.slotId}`;
    expect(contract._getAvailability().get(key).isBooked).toBe(true);
  });
  
  it('should not allow booking an already booked slot', () => {
    const provider = 'SP2PROVIDER';
    const patient1 = 'SP3PATIENT1';
    const patient2 = 'SP4PATIENT2';
    const startTime = 1672531200;
    const endTime = 1672534800;
    
    // Provider adds availability
    const addResult = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    // First patient books consultation
    contract.bookConsultation(
        patient1,
        provider,
        addResult.slotId,
        'Initial consultation'
    );
    
    // Second patient tries to book the same slot
    const bookResult = contract.bookConsultation(
        patient2,
        provider,
        addResult.slotId,
        'Another consultation'
    );
    
    expect(bookResult.error).toBe(2);
  });
  
  it('should allow provider to complete a consultation', () => {
    const provider = 'SP2PROVIDER';
    const patient = 'SP3PATIENT';
    const startTime = 1672531200;
    const endTime = 1672534800;
    
    // Provider adds availability
    const addResult = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    // Patient books consultation
    const bookResult = contract.bookConsultation(
        patient,
        provider,
        addResult.slotId,
        'Initial consultation'
    );
    
    // Provider completes consultation
    const completeResult = contract.completeConsultation(
        provider,
        bookResult.consultationId
    );
    
    expect(completeResult.success).toBe(true);
    
    // Check if consultation status was updated
    const consultation = contract.getConsultation(bookResult.consultationId);
    expect(consultation.status).toBe(1); // completed
  });
  
  it('should not allow non-provider to complete a consultation', () => {
    const provider = 'SP2PROVIDER';
    const patient = 'SP3PATIENT';
    const nonProvider = 'SP4NONPROVIDER';
    const startTime = 1672531200;
    const endTime = 1672534800;
    
    // Provider adds availability
    const addResult = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    // Patient books consultation
    const bookResult = contract.bookConsultation(
        patient,
        provider,
        addResult.slotId,
        'Initial consultation'
    );
    
    // Non-provider tries to complete consultation
    const completeResult = contract.completeConsultation(
        nonProvider,
        bookResult.consultationId
    );
    
    expect(completeResult.error).toBe(403);
    
    // Check if consultation status remains unchanged
    const consultation = contract.getConsultation(bookResult.consultationId);
    expect(consultation.status).toBe(0); // still scheduled
  });
  
  it('should allow patient to cancel a consultation', () => {
    const provider = 'SP2PROVIDER';
    const patient = 'SP3PATIENT';
    const startTime = 1672531200;
    const endTime = 1672534800;
    
    // Provider adds availability
    const addResult = contract.addAvailabilitySlot(provider, startTime, endTime);
    
    // Patient books consultation
    const bookResult = contract.bookConsultation(
        patient,
        provider,
        addResult.slotId,
        'Initial consultation'
    );
    
    // Patient cancels consultation
    const cancelResult = contract.cancelConsultation(
        patient,
        bookResult.consultationId
    );
    
    expect(cancelResult.success).toBe(true);
    
    // Check if consultation status was updated
    const consultation = contract.getConsultation(bookResult.consultationId);
    expect(consultation.status).toBe(2); // cancelled
  });
});
