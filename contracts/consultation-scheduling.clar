;; Consultation Scheduling Contract
;; This contract manages appointment booking

(define-data-var admin principal tx-sender)

;; Consultation status: 0 = scheduled, 1 = completed, 2 = cancelled
(define-map consultations
  { consultation-id: uint }
  {
    provider: principal,
    patient: principal,
    timestamp: uint,
    duration: uint,
    status: uint,
    notes: (string-utf8 500)
  }
)

;; Provider availability slots
(define-map availability
  { provider: principal, slot-id: uint }
  {
    start-time: uint,
    end-time: uint,
    is-booked: bool
  }
)

;; Counter for consultation IDs
(define-data-var consultation-id-counter uint u0)

;; Only allow the admin to perform certain actions
(define-private (is-admin)
  (is-eq tx-sender (var-get admin))
)

;; Add availability slot (provider only)
(define-public (add-availability-slot (start-time uint) (end-time uint))
  (let ((slot-id (var-get consultation-id-counter)))
    (begin
      ;; Ensure end time is after start time
      (asserts! (> end-time start-time) (err u1))

      ;; Increment the counter
      (var-set consultation-id-counter (+ slot-id u1))

      ;; Add the availability slot
      (ok (map-set availability
        { provider: tx-sender, slot-id: slot-id }
        {
          start-time: start-time,
          end-time: end-time,
          is-booked: false
        }))
    )
  )
)

;; Book a consultation
(define-public (book-consultation (provider principal) (slot-id uint) (notes (string-utf8 500)))
  (let ((consultation-id (var-get consultation-id-counter))
        (slot (map-get? availability { provider: provider, slot-id: slot-id })))
    (begin
      ;; Check if slot exists and is not booked
      (asserts! (is-some slot) (err u404))
      (asserts! (not (get is-booked (unwrap-panic slot))) (err u2))

      ;; Mark slot as booked
      (map-set availability
        { provider: provider, slot-id: slot-id }
        (merge (unwrap-panic slot) { is-booked: true }))

      ;; Create consultation
      (var-set consultation-id-counter (+ consultation-id u1))
      (ok (map-set consultations
        { consultation-id: consultation-id }
        {
          provider: provider,
          patient: tx-sender,
          timestamp: (get start-time (unwrap-panic slot)),
          duration: (- (get end-time (unwrap-panic slot)) (get start-time (unwrap-panic slot))),
          status: u0,
          notes: notes
        }))
    )
  )
)

;; Complete a consultation (provider only)
(define-public (complete-consultation (consultation-id uint))
  (let ((consultation (map-get? consultations { consultation-id: consultation-id })))
    (begin
      (asserts! (is-some consultation) (err u404))
      (asserts! (is-eq (get provider (unwrap-panic consultation)) tx-sender) (err u403))
      (ok (map-set consultations
        { consultation-id: consultation-id }
        (merge (unwrap-panic consultation) { status: u1 })))
    )
  )
)

;; Cancel a consultation (either provider or patient)
(define-public (cancel-consultation (consultation-id uint))
  (let ((consultation (map-get? consultations { consultation-id: consultation-id })))
    (begin
      (asserts! (is-some consultation) (err u404))
      (asserts! (or
                 (is-eq (get provider (unwrap-panic consultation)) tx-sender)
                 (is-eq (get patient (unwrap-panic consultation)) tx-sender))
                (err u403))
      (ok (map-set consultations
        { consultation-id: consultation-id }
        (merge (unwrap-panic consultation) { status: u2 })))
    )
  )
)

;; Get consultation details
(define-read-only (get-consultation (consultation-id uint))
  (map-get? consultations { consultation-id: consultation-id })
)

;; Get provider's availability
(define-read-only (get-provider-availability (provider principal) (slot-id uint))
  (map-get? availability { provider: provider, slot-id: slot-id })
)

;; Transfer admin rights (admin only)
(define-public (transfer-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err u403))
    (ok (var-set admin new-admin))
  )
)
