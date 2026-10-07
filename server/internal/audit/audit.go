package audit

import (
	"database/sql"
	"encoding/json"
	"log"
)

// WriteAudit records a mutation / security event. Failures are logged, never fatal to the request.
func WriteAudit(db *sql.DB, actorUserID *int64, action, entity string, entityID *int64, detail any) {
	if db == nil {
		return
	}

	var detailJSON *string
	if detail != nil {
		b, err := json.Marshal(detail)
		if err != nil {
			log.Printf("audit marshal: %v", err)
		} else {
			s := string(b)
			detailJSON = &s
		}
	}

	_, err := db.Exec(`
		INSERT INTO audit_logs (actor_user_id, action, entity, entity_id, detail)
		VALUES (?, ?, ?, ?, ?)
	`, actorUserID, action, entity, entityID, detailJSON)
	if err != nil {
		log.Printf("audit write: %v", err)
	}
}
